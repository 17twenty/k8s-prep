Suppose we want this:

```yaml
kind: PreviewEnvironment
spec:
  image: shop:pr-482
  replicas: 2
```

to result in:

```text
Deployment
Service
```

We need a controller.

Conceptually:

```text
Developer
   |
   | kubectl apply
   v
Kubernetes API
   |
   | PreviewEnvironment/pr-482
   v
Preview controller
   |
   +-- Deployment
   |
   +-- Service
```

The controller repeatedly reconciles desired state.

Pseudo-code:

```go
func Reconcile(name string) {
    desired := readPreviewEnvironment(name)
    actual := inspectCurrentResources(name)

    reconcileDeployment(desired, actual)
    reconcileService(desired, actual)

    updateStatus()
}
```

The important property is **idempotency**.

Good reconciliation logic says:

```text
Ensure a Deployment exists with image X and replicas N.
```

Bad reconciliation logic says:

```text
Create another Deployment every time reconcile runs.
```

A reconcile can happen repeatedly and for reasons your controller did not initiate.

The result should converge.

This is the same mental model from Chapter 1, now implemented by application-specific code.
