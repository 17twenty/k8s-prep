Check:

```bash
kubectl get daemonset cilium \
  -n kube-system
```

List agents:

```bash
kubectl get pods \
  -n kube-system \
  -l k8s-app=cilium \
  -o wide
```

Delete one:

```bash
kubectl delete pod \
  -n kube-system \
  <cilium-pod-name>
```

Watch:

```bash
kubectl get pods \
  -n kube-system \
  -l k8s-app=cilium \
  -w
```

The DaemonSet controller notices the mismatch and replaces it.

```text
Delete agent
    |
    v
Desired != Actual
    |
    v
DaemonSet controller
    |
    v
Replacement agent
```

Same reconciliation model.

Lower in the stack.
