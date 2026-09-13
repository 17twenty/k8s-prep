Use one namespace for the whole cookbook so that commands stay short and cleanup is easy.

```bash
kubectl create namespace cookbook
```

Make it the default namespace for the current context:

```bash
kubectl config set-context \
  --current \
  --namespace=cookbook
```

Check:

```bash
kubectl config view --minify \
  -o jsonpath='{..namespace}{"\n"}'
```

Expected:

```text
cookbook
```

Check that the cluster is reachable:

```bash
kubectl version
kubectl get nodes
```

Useful throughout the cookbook:

```bash
kubectl get all
```

Despite the name, `all` does **not** mean every Kubernetes API resource.

For actual API discovery:

```bash
kubectl api-resources
```

## A note about the lab

Most examples work on any ordinary Kubernetes cluster.

A few exercises depend on optional cluster capabilities:

- PersistentVolumeClaims need a storage provisioner or an existing PersistentVolume.
- NetworkPolicy enforcement needs a CNI that implements NetworkPolicy.
- Ingress routing needs an Ingress controller.
- CRD exercises need permission to create cluster-scoped CustomResourceDefinitions.

When one of those assumptions matters, the recipe will say so.
