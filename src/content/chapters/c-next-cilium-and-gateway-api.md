Our cluster now has:

```text
Kubernetes 1.35
Cilium 1.20.1
kube-proxy replacement
```

That is exactly the substrate we want for:

```text
appendix-d-cilium-gateway-api.md
```

Next we will take:

```text
Service
NetworkPolicy
GatewayClass
Gateway
HTTPRoute
```

and follow them through:

```text
Kubernetes API
      |
      v
Cilium
      |
      v
eBPF / Envoy
      |
      v
actual traffic
```

That is where the application-facing Kubernetes API starts turning into a modern platform dataplane.
