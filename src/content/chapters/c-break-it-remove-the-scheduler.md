This is intentionally destructive.

Do it only in this disposable lab.

On `k8s-control`:

```bash
sudo mv \
  /etc/kubernetes/manifests/kube-scheduler.yaml \
  /tmp/kube-scheduler.yaml
```

Watch:

```bash
kubectl get pods \
  -n kube-system \
  -l component=kube-scheduler
```

Now create:

```bash
kubectl run no-scheduler \
  --image=nginx:1.27-alpine
```

Inspect:

```bash
kubectl get pod no-scheduler \
  -o wide
```

It should remain:

```text
Pending
```

Why?

```text
kubectl
   |
   v
API server
   |
   v
Pod object exists
   |
   X
scheduler
   |
   X
spec.nodeName
```

The API server can accept the object while another critical control-plane component is unavailable.

Restore:

```bash
sudo mv \
  /tmp/kube-scheduler.yaml \
  /etc/kubernetes/manifests/kube-scheduler.yaml
```

Watch:

```bash
kubectl get pod no-scheduler -w
```

Eventually:

```text
Pending -> Running
```

Cleanup:

```bash
kubectl delete pod no-scheduler
```

This is a useful distinction:

```text
API availability
```

is not the same as:

```text
complete cluster reconciliation
```
