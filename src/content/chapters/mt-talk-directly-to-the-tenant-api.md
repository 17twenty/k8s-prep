Try:

```bash
kubectl --kubeconfig=/tmp/kamaji-tenant.conf \
  cluster-info
```

Then:

```bash
kubectl --kubeconfig=/tmp/kamaji-tenant.conf \
  get namespaces
```

Now the important command:

```bash
kubectl --kubeconfig=/tmp/kamaji-tenant.conf \
  get nodes
```

Expected:

```text
No resources found.
```

This is not an error.

We successfully have:

```text
kube-apiserver          yes
controller-manager      yes
scheduler               yes
Kubernetes API          yes
worker node             no
```

That gives us a clean mental model:

```text
control plane exists
        !=
compute exists
```

The tenant has a Kubernetes cluster control plane before it has somewhere to run application Pods.
