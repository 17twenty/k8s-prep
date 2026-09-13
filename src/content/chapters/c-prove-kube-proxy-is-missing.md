Check:

```bash
kubectl get daemonsets \
  -n kube-system
```

Then explicitly:

```bash
kubectl get daemonset kube-proxy \
  -n kube-system
```

Expected:

```text
Error from server (NotFound)
```

That was intentional.

We are going to ask Cilium to provide the Kubernetes Service dataplane instead.
