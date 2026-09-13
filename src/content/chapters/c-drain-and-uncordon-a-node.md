Before maintenance:

```bash
kubectl drain k8s-worker \
  --ignore-daemonsets \
  --delete-emptydir-data
```

Check:

```bash
kubectl get nodes
```

The worker should show:

```text
SchedulingDisabled
```

Inspect workload placement:

```bash
kubectl get pods -o wide
```

Return it to service:

```bash
kubectl uncordon k8s-worker
```

Check:

```bash
kubectl get nodes
```

This is different from simply switching the server off.

You declared operational intent to Kubernetes first.
