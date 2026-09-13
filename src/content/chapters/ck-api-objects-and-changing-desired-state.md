The previous chapter used commands such as:

```bash
kubectl create deployment ...
kubectl scale deployment ...
```

It is tempting to think of those as special operations implemented by Kubernetes.

A better mental model is:

> `kubectl` is mostly a client for the Kubernetes API.

Different commands give us different ways to create or modify API objects.

## The common shape of a Kubernetes object

Most manifests have the same top-level structure:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: example
spec:
  replicas: 3
```

Think:

```text
apiVersion -> which API schema?
kind       -> what type of object?
metadata   -> which object?
spec       -> what do I want?
status     -> what does Kubernetes observe?
```

`status` is normally omitted from manifests you write.

Controllers populate it after the object exists.

## Ask Kubernetes for the object we already created

```bash
kubectl get deployment api -o yaml
```

There is a lot of output.

Do not try to read it all.

Find these areas:

```text
metadata:
spec:
status:
```

The object in the API is richer than the small amount of configuration we initially supplied because Kubernetes defaults fields and controllers add status.

## Generate YAML instead of writing it from memory

Generate a Deployment manifest without creating anything:

```bash
kubectl create deployment generated \
  --image=nginx:1.27-alpine \
  --replicas=2 \
  --dry-run=client \
  -o yaml
```

Save it:

```bash
kubectl create deployment generated \
  --image=nginx:1.27-alpine \
  --replicas=2 \
  --dry-run=client \
  -o yaml > generated.yaml
```

Now the manifest is editable source rather than something you had to remember from scratch.

## Several commands, one underlying idea

These commands look different:

```text
kubectl scale
kubectl set image
kubectl edit
kubectl patch
kubectl apply
```

But they all ultimately modify desired state stored in the API.

### `kubectl scale`

Purpose-built mutation:

```bash
kubectl scale deployment api --replicas=4
```

It changes:

```text
.spec.replicas
```

Return to three replicas:

```bash
kubectl scale deployment api --replicas=3
```

### `kubectl set image`

Another purpose-built mutation:

```bash
kubectl set image deployment/api \
  nginx=nginx:1.27-alpine
```

It changes the container image in the Deployment's Pod template.

### `kubectl edit`

Open the live object in an editor:

```bash
kubectl edit deployment api
```

Useful during an exam or incident.

Less useful as a repeatable deployment process because the change only exists as an API mutation unless you also update your source manifest.

### `kubectl patch`

Change a small part of an object without rewriting the whole manifest:

```bash
kubectl patch deployment api \
  --type=merge \
  -p '{"spec":{"replicas":2}}'
```

Check:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.replicas}{"\n"}'
```

Then restore:

```bash
kubectl scale deployment api --replicas=3
```

### `kubectl apply`

`apply` is the usual declarative workflow.

You keep the desired configuration in a file and ask Kubernetes to make the live object agree with it.

For example:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: declarative-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: declarative-demo
  template:
    metadata:
      labels:
        app: declarative-demo
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
```

Save as `declarative-demo.yaml` and apply:

```bash
kubectl apply -f declarative-demo.yaml
```

Change:

```yaml
replicas: 2
```

Apply again:

```bash
kubectl apply -f declarative-demo.yaml
```

Observe:

```bash
kubectl get deployment declarative-demo
```

Cleanup:

```bash
kubectl delete -f declarative-demo.yaml
rm -f declarative-demo.yaml generated.yaml
```

## Imperative and declarative are not opposing religions

For application developers, both are useful.

Imperative commands are excellent for:

- exploration
- debugging
- CKAD speed
- one-off mutations
- generating starter YAML

Declarative files are excellent for:

- review
- version control
- repeatability
- GitOps
- production change management

The important thing is understanding **what API field you are changing and why**.
