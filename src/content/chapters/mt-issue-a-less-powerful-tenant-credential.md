A tenant does not need to give every user administrator access either.

vCluster can generate a kubeconfig backed by a ServiceAccount and bind that ServiceAccount to a tenant-local ClusterRole.

Create/connect using a read-only tenant identity:

```bash
vcluster connect alice \
  --namespace tenant-alice \
  --service-account kube-system/alice-viewer \
  --cluster-role view
```

Now test it:

```bash
kubectl auth can-i get pods --all-namespaces
```

Expected:

```text
yes
```

But:

```bash
kubectl auth can-i create namespaces
```

Expected:

```text
no
```

And:

```bash
kubectl auth can-i create deployments.apps
```

Expected:

```text
no
```

So there are now **two authorization domains** in play:

```text
provider API
    |
    +-- provider decides who may manage vCluster infrastructure

Alice tenant API
    |
    +-- tenant decides who is admin, viewer, developer, etc.
```

Reconnect with the default tenant administrator credential for the next exercise:

```bash
vcluster connect alice \
  --namespace tenant-alice
```
