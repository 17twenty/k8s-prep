Kamaji writes the tenant administrator kubeconfig into a Secret named after the TenantControlPlane.

For the sample tenant:

```bash
kubectl get secret k8s-133-admin-kubeconfig
```

Extract it:

```bash
kubectl get secret k8s-133-admin-kubeconfig \
  -o jsonpath='{.data.admin\.conf}' \
  | base64 -d \
  > /tmp/kamaji-tenant.conf
```

Inspect its target without changing your main kubeconfig:

```bash
kubectl --kubeconfig=/tmp/kamaji-tenant.conf \
  config view --minify
```

We now have separate credentials for separate APIs:

```text
~/.kube/config
    -> provider / management clusters

/tmp/kamaji-tenant.conf
    -> tenant Kubernetes API
```
