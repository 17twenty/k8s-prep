Remove the Argo-managed application first:

```bash
kubectl delete application web-dev \
  -n argocd
```

Depending on finalizer/prune configuration, inspect whether its managed resources remain:

```bash
kubectl get all \
  -n web-dev
```

Delete the lab namespace if required:

```bash
kubectl delete namespace web-dev
```

Remove Argo Rollouts:

```bash
kubectl delete namespace argo-rollouts
```

Remove Argo CD:

```bash
kubectl delete namespace argocd
```

The CRDs are cluster-scoped and may remain after deleting namespaces.

Inspect:

```bash
kubectl get crd \
  | grep argoproj
```

For a disposable kind lab, the cleanest full reset is often simply deleting and recreating the cluster.

Do not blindly use that advice on a cluster containing anything you care about.
