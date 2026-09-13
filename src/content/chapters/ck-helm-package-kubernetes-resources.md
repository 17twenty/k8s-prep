Raw YAML is useful, but real applications often contain many related resources and environment-specific values.

Helm packages Kubernetes resources into a **Chart**.

Think:

```text
Chart templates + values
          |
          v
rendered Kubernetes manifests
          |
          v
Kubernetes API
```

Helm is not a replacement for Kubernetes objects.

It generates and manages them.

## Create a local chart

Assuming the `helm` CLI is installed:

```bash
helm create cookbook-api
```

Inspect:

```bash
find cookbook-api -maxdepth 2 -type f
```

## Render before installing

```bash
helm template test cookbook-api
```

Override a value:

```bash
helm template test cookbook-api \
  --set replicaCount=2
```

Rendering is a powerful debugging technique because it lets you inspect the actual Kubernetes manifests before they reach the API server.

## Install

```bash
helm install cookbook-example cookbook-api
```

Inspect:

```bash
helm list
kubectl get all -l app.kubernetes.io/instance=cookbook-example
```

Change a value through an upgrade:

```bash
helm upgrade cookbook-example cookbook-api \
  --set replicaCount=2
```

History:

```bash
helm history cookbook-example
```

Uninstall:

```bash
helm uninstall cookbook-example
rm -rf cookbook-api
```

A useful failure workflow is:

```text
values
  |
  v
helm template
  |
  v
inspect rendered YAML
  |
  v
kubectl explain / server validation
```
