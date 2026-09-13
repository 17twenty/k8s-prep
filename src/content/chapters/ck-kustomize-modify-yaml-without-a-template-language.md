Kustomize solves a different packaging problem.

Instead of templating YAML, it starts with ordinary Kubernetes manifests and layers transformations over them.

Think:

```text
base resources
      +
overlay changes
      |
      v
rendered Kubernetes manifests
```

`kubectl` has built-in Kustomize support.

## Create a base

```bash
mkdir -p kustomize/base
mkdir -p kustomize/overlays/dev
```

Generate a Deployment:

```bash
kubectl create deployment k-api \
  --image=nginx:1.27-alpine \
  --dry-run=client \
  -o yaml > kustomize/base/deployment.yaml
```

Create `kustomize/base/kustomization.yaml`:

```yaml
resources:
  - deployment.yaml
```

## Create an overlay

Create `kustomize/overlays/dev/kustomization.yaml`:

```yaml
resources:
  - ../../base

namePrefix: dev-

replicas:
  - name: k-api
    count: 2
```

Render:

```bash
kubectl kustomize kustomize/overlays/dev
```

Apply:

```bash
kubectl apply -k kustomize/overlays/dev
```

Inspect:

```bash
kubectl get deployment dev-k-api
```

Cleanup:

```bash
kubectl delete -k kustomize/overlays/dev
rm -rf kustomize
```

A useful distinction:

```text
Helm
    -> package + template/value system + release management

Kustomize
    -> transform/compose ordinary Kubernetes YAML
```

They can coexist in real systems.
