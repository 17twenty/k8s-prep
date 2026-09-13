This appendix was written against:

```text
Kubernetes:  1.35
Cilium:      1.20.1
Gateway API: 1.6.1
```

Cilium 1.20.1 officially supports Kubernetes 1.35.

Its Gateway API implementation supports Gateway API 1.6.1 and requires:

```text
kubeProxyReplacement=true
```

with L7 proxy support enabled.

Cilium host-network Gateway mode is used here specifically so the kubeadm lab does not require a separate `LoadBalancer` implementation.

Always check the matching upstream documentation when moving to a newer Cilium or Gateway API version.
