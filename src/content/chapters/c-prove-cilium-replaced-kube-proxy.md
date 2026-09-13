Check again:

```bash
kubectl get daemonset kube-proxy \
  -n kube-system
```

It should still not exist.

Now ask Cilium:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg status \
  | grep KubeProxyReplacement
```

Expected:

```text
KubeProxyReplacement:   True
```

For more detail:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg status --verbose
```

Our cluster now looks more like:

```text
Kubernetes API
      |
      v
   Service
      |
      v
Cilium agent
      |
      v
 eBPF maps
      |
      v
   backend Pod
```
