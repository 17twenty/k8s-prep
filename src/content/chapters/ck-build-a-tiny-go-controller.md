Chapter 1 told us that Kubernetes is a control system.

Now we are going to write one of those control loops ourselves.

Our custom API says:

```yaml
kind: PreviewEnvironment
spec:
  image: nginx:1.27-alpine
  replicas: 2
```

We want that to cause:

```text
PreviewEnvironment
       |
       +-- Deployment
       |
       +-- Service
```

and we want the custom resource to report:

```yaml
status:
  readyReplicas: 2
  url: http://pr-482.cookbook.svc.cluster.local
```

That requires a controller.

## The smallest useful reconciliation loop

A production controller normally uses watches, informers, a work queue, retries and often leader election.

We are deliberately starting with something smaller:

```text
every 2 seconds
     |
     v
list PreviewEnvironments
     |
     v
for each one
     |
     +-- apply desired Deployment
     +-- apply desired Service
     +-- read observed Deployment status
     +-- update PreviewEnvironment status
```

Polling is not the architecture we would choose for a serious controller.

It is useful here because the reconciliation logic stays visible.

The controller uses **server-side apply** for its child resources. Re-running the same desired definition therefore converges instead of creating another Deployment every loop.

## Create the Go project

You need Go installed for this deep dive.

Check:

```bash
go version
```

Create a workspace:

```bash
mkdir -p /tmp/preview-controller
cd /tmp/preview-controller

go mod init example.com/preview-controller

go get \
  k8s.io/apimachinery@v0.35.0 \
  k8s.io/client-go@v0.35.0
```

`client-go` uses matching `v0.X.Y` versions for Kubernetes `v1.X.Y` releases, so `v0.35.0` aligns with our Kubernetes 1.35 target.

Save as `main.go`:

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

var (
	previewGVR = schema.GroupVersionResource{Group: "platform.example.com", Version: "v1alpha1", Resource: "previewenvironments"}
	deployGVR  = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	serviceGVR = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}
)

type controller struct {
	namespace string
	client    dynamic.Interface
}

func main() {
	cfg, err := kubeConfig()
	if err != nil {
		log.Fatal(err)
	}

	client, err := dynamic.NewForConfig(cfg)
	if err != nil {
		log.Fatal(err)
	}

	namespace := os.Getenv("NAMESPACE")
	if namespace == "" {
		namespace = "cookbook"
	}

	c := &controller{namespace: namespace, client: client}
	ctx := context.Background()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	log.Printf("reconciling PreviewEnvironments in %q", namespace)

	for {
		if err := c.reconcileAll(ctx); err != nil {
			log.Printf("reconcile: %v", err)
		}
		<-ticker.C
	}
}

func kubeConfig() (*rest.Config, error) {
	if cfg, err := rest.InClusterConfig(); err == nil {
		return cfg, nil
	}

	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		clientcmd.NewDefaultClientConfigLoadingRules(),
		&clientcmd.ConfigOverrides{},
	).ClientConfig()
}

func (c *controller) reconcileAll(ctx context.Context) error {
	previews := c.client.Resource(previewGVR).Namespace(c.namespace)
	list, err := previews.List(ctx, metav1.ListOptions{})
	if err != nil {
		return err
	}

	for i := range list.Items {
		preview := &list.Items[i]
		if preview.GetDeletionTimestamp() != nil {
			continue
		}
		if err := c.reconcile(ctx, preview); err != nil {
			log.Printf("%s: %v", preview.GetName(), err)
		}
	}
	return nil
}

func (c *controller) reconcile(ctx context.Context, preview *unstructured.Unstructured) error {
	name := preview.GetName()
	image, _, _ := unstructured.NestedString(preview.Object, "spec", "image")
	replicas, _, _ := unstructured.NestedInt64(preview.Object, "spec", "replicas")
	if image == "" || replicas < 1 {
		return fmt.Errorf("spec.image and spec.replicas are required")
	}

	labels := map[string]any{
		"app.kubernetes.io/name":       name,
		"platform.example.com/preview": name,
	}
	owner := []any{map[string]any{
		"apiVersion": "platform.example.com/v1alpha1",
		"kind":       "PreviewEnvironment",
		"name":       name,
		"uid":        string(preview.GetUID()),
		"controller": true,
	}}

	deployment := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "apps/v1",
		"kind":       "Deployment",
		"metadata": map[string]any{
			"name":            name,
			"namespace":       c.namespace,
			"ownerReferences": owner,
		},
		"spec": map[string]any{
			"replicas": replicas,
			"selector": map[string]any{"matchLabels": labels},
			"template": map[string]any{
				"metadata": map[string]any{"labels": labels},
				"spec": map[string]any{
					"containers": []any{map[string]any{
						"name":  "web",
						"image": image,
						"ports": []any{map[string]any{"containerPort": int64(80)}},
					}},
				},
			},
		},
	}}

	service := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "v1",
		"kind":       "Service",
		"metadata": map[string]any{
			"name":            name,
			"namespace":       c.namespace,
			"ownerReferences": owner,
		},
		"spec": map[string]any{
			"selector": labels,
			"ports": []any{map[string]any{
				"name":       "http",
				"port":       int64(80),
				"targetPort": int64(80),
			}},
		},
	}}

	if err := c.apply(ctx, deployGVR, deployment); err != nil {
		return err
	}
	if err := c.apply(ctx, serviceGVR, service); err != nil {
		return err
	}

	current, err := c.client.Resource(deployGVR).Namespace(c.namespace).
		Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	ready, _, _ := unstructured.NestedInt64(current.Object, "status", "readyReplicas")

	return c.updateStatus(ctx, preview, ready)
}

func (c *controller) apply(ctx context.Context, gvr schema.GroupVersionResource, obj *unstructured.Unstructured) error {
	body, err := json.Marshal(obj.Object)
	if err != nil {
		return err
	}

	force := true
	_, err = c.client.Resource(gvr).Namespace(c.namespace).Patch(
		ctx,
		obj.GetName(),
		types.ApplyPatchType,
		body,
		metav1.PatchOptions{FieldManager: "preview-controller", Force: &force},
	)
	return err
}

func (c *controller) updateStatus(ctx context.Context, preview *unstructured.Unstructured, ready int64) error {
	url := fmt.Sprintf("http://%s.%s.svc.cluster.local", preview.GetName(), c.namespace)
	oldReady, _, _ := unstructured.NestedInt64(preview.Object, "status", "readyReplicas")
	oldURL, _, _ := unstructured.NestedString(preview.Object, "status", "url")
	if oldReady == ready && oldURL == url {
		return nil
	}

	updated := preview.DeepCopy()
	_ = unstructured.SetNestedField(updated.Object, ready, "status", "readyReplicas")
	_ = unstructured.SetNestedField(updated.Object, url, "status", "url")

	_, err := c.client.Resource(previewGVR).Namespace(c.namespace).
		UpdateStatus(ctx, updated, metav1.UpdateOptions{})
	return err
}
```

Format and resolve dependencies:

```bash
gofmt -w main.go
go mod tidy
```

## Run the controller from your laptop first

The program first tries in-cluster credentials. If it is not running in Kubernetes, it falls back to your normal kubeconfig.

Make sure you are still pointed at the cookbook lab:

```bash
kubectl config current-context
kubectl config view --minify \
  -o jsonpath='{..namespace}{"\n"}'
```

Then run:

```bash
go run .
```

Leave it running.

In another terminal:

```bash
kubectl get preview,deployment,service,pods
```

The custom resource from Chapter 33 should now cause a Deployment and Service to appear.

Wait for the child Deployment to be created, then for its rollout:

```bash
kubectl wait   --for=create   deployment/pr-482   --timeout=30s

kubectl rollout status deployment/pr-482
```

Then inspect custom status:

```bash
kubectl get preview pr-482 \
  -o jsonpath='{.status.readyReplicas}{" ready -> "}{.status.url}{"\n"}'
```

You should eventually see:

```text
2 ready -> http://pr-482.cookbook.svc.cluster.local
```

The path is now real:

```text
PreviewEnvironment.spec
        |
        v
our Go controller
        |
        +-- server-side apply Deployment
        |
        +-- server-side apply Service
        |
        v
Deployment.status
        |
        v
PreviewEnvironment.status
```

## Change desired state

Change the custom resource rather than the generated Deployment:

```bash
kubectl patch preview pr-482 \
  --type=merge \
  -p '{"spec":{"replicas":3}}'
```

Watch:

```bash
kubectl get preview,deployment,pods -w
```

The controller sees the new desired state and changes the Deployment.

## Create drift on purpose

Now fight the controller.

Scale its child Deployment directly:

```bash
kubectl scale deployment pr-482 --replicas=1
```

Check immediately:

```bash
kubectl get deployment pr-482
```

Then check again a few seconds later:

```bash
sleep 3
kubectl get deployment pr-482
```

It should return to three replicas.

Why?

```text
PreviewEnvironment.spec.replicas = 3
              |
              v
controller observes child replicas = 1
              |
              v
server-side apply desired Deployment
              |
              v
child replicas = 3
```

This is Chapter 1's control loop implemented by code we wrote ourselves.

## Delete a child

Delete the generated Deployment:

```bash
kubectl delete deployment pr-482
```

Watch the labelled Deployment set rather than asking for the temporarily missing object by name:

```bash
kubectl get deployment   -l platform.example.com/preview=pr-482   -w
```

Within a reconciliation cycle, it should reappear.

Again, the controller is not issuing an imperative "restart" command.

It is repeatedly asserting:

```text
A Deployment named pr-482 should exist with this spec.
```

Press `Ctrl-C` in the terminal running `go run .` before the next step.

## Run the controller as a Kubernetes workload

Running from your laptop proved the control loop.

Now make the controller obey the same platform rules as every other workload.

Create a `Dockerfile`:

```dockerfile
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /controller .

FROM scratch
COPY --from=build /controller /controller
USER 65532:65532
ENTRYPOINT ["/controller"]
```

Build it:

```bash
docker build -t example/preview-controller:v1 .
```

Our lab is kind, so reuse the image-distribution lesson from Chapter 9:

```bash
kind load docker-image \
  example/preview-controller:v1 \
  --name ckad
```

## Give it only the API permissions it needs

Save as `controller-rbac.yaml`:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: preview-controller
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: preview-controller
rules:
  - apiGroups: ["platform.example.com"]
    resources:
      - previewenvironments
      - previewenvironments/status
    verbs:
      - get
      - list
      - watch
      - update
      - patch

  - apiGroups: ["apps"]
    resources:
      - deployments
    verbs:
      - get
      - list
      - watch
      - create
      - update
      - patch

  - apiGroups: [""]
    resources:
      - services
    verbs:
      - get
      - list
      - watch
      - create
      - update
      - patch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: preview-controller
subjects:
  - kind: ServiceAccount
    name: preview-controller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: preview-controller
```

Apply:

```bash
kubectl apply -f controller-rbac.yaml
```

Prove the scope before running anything:

```bash
kubectl auth can-i patch deployments \
  --as=system:serviceaccount:cookbook:preview-controller

kubectl auth can-i update previewenvironments/status \
  --api-group=platform.example.com \
  --as=system:serviceaccount:cookbook:preview-controller

kubectl auth can-i delete nodes \
  --as=system:serviceaccount:cookbook:preview-controller
```

The first two should be allowed.

Deleting Nodes should not be.

That connects our controller directly back to Chapter 23:

```text
controller needs API access
        |
        v
ServiceAccount identity
        |
        v
Role grants minimum namespace permissions
```

## Deploy the controller

Save as `controller-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: preview-controller
spec:
  replicas: 1

  selector:
    matchLabels:
      app: preview-controller

  template:
    metadata:
      labels:
        app: preview-controller

    spec:
      serviceAccountName: preview-controller

      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault

      containers:
        - name: controller
          image: example/preview-controller:v1
          imagePullPolicy: IfNotPresent

          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL

          env:
            - name: NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
```

Apply:

```bash
kubectl apply -f controller-deployment.yaml
kubectl rollout status deployment/preview-controller
```

Follow its logs:

```bash
kubectl logs deployment/preview-controller -f
```

The controller now uses:

- a ServiceAccount from the RBAC chapter
- namespace discovery from the Downward API chapter
- a hardened SecurityContext from Chapter 24
- a locally built image loaded into kind as in Chapter 9
- a custom API from Chapter 33
- server-side apply to express child desired state

This is why the earlier chapters matter.

They compose.

Leave the controller, CRD and `PreviewEnvironment/pr-482` running.

Chapter 35 will inspect the ownership and status relationships we just created.

## What we deliberately left out

Our controller polls every two seconds because that keeps the first implementation understandable.

A production controller normally evolves toward:

```text
watch / informer
      |
      v
work queue
      |
      v
reconcile(key)
      |
      +-- retry with backoff
      +-- status / conditions
      +-- metrics
      +-- leader election when replicated
```

Libraries such as `client-go` and `controller-runtime` provide those building blocks.

The essential idea does not change:

> Reconciliation should be idempotent. Running it repeatedly should converge the system toward the same desired state, not create more side effects every time.
