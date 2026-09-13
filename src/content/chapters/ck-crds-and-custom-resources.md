Kubernetes' built-in API contains types such as:

```text
Pod
Deployment
Service
Secret
Job
```

But platform teams often want domain-specific APIs.

For example:

```yaml
kind: PreviewEnvironment
spec:
  image: nginx:1.27-alpine
  replicas: 2
```

A **CustomResourceDefinition (CRD)** teaches the Kubernetes API server about a new resource type.

This exercise requires permission to create cluster-scoped CRDs.

## Create a CRD

Save as `preview-crd.yaml`:

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: previewenvironments.platform.example.com
spec:
  group: platform.example.com
  scope: Namespaced

  names:
    plural: previewenvironments
    singular: previewenvironment
    kind: PreviewEnvironment
    shortNames:
      - preview

  versions:
    - name: v1alpha1
      served: true
      storage: true

      subresources:
        status: {}

      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                image:
                  type: string
                replicas:
                  type: integer
                  minimum: 1
              required:
                - image
                - replicas

            status:
              type: object
              properties:
                readyReplicas:
                  type: integer
                url:
                  type: string
```

Apply:

```bash
kubectl apply -f preview-crd.yaml
```

Discover it:

```bash
kubectl api-resources | grep -i preview
```

Ask for its schema:

```bash
kubectl explain previewenvironments
kubectl explain previewenvironments.spec
kubectl explain previewenvironments.status
```

The CRD extended API discovery just like a built-in type.

The `status` subresource also gives a future controller somewhere separate to report observed state without pretending that status is user intent.

## Create a Custom Resource

Save as `preview.yaml`:

```yaml
apiVersion: platform.example.com/v1alpha1
kind: PreviewEnvironment
metadata:
  name: pr-482
spec:
  image: nginx:1.27-alpine
  replicas: 2
```

Apply:

```bash
kubectl apply -f preview.yaml
```

Query:

```bash
kubectl get previewenvironments
```

Or use the short name:

```bash
kubectl get preview
```

Inspect:

```bash
kubectl get preview pr-482 -o yaml
```

Now notice what did **not** happen.

There are no application Pods for `pr-482`.

Why?

```text
CRD
 |
 v
Kubernetes understands the data type

but

No controller
 |
 v
Nothing implements its behaviour
```

This distinction is fundamental:

> A CRD extends the API. It does not, by itself, implement a control loop.

Leave `preview-crd.yaml` and `preview.yaml` in place.

The next chapter gives them behaviour.
