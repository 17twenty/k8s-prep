Check nodes:

```bash
kubectl get nodes
```

Check Cilium:

```bash
cilium status --wait
```

Confirm kube-proxy is absent:

```bash
kubectl get daemonset kube-proxy \
  -n kube-system
```

Expected:

```text
Error from server (NotFound)
```

Confirm replacement mode:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg status \
  | grep KubeProxyReplacement
```

Expected:

```text
KubeProxyReplacement:   True
```

This matters because Cilium's Gateway API implementation requires kube-proxy replacement.
