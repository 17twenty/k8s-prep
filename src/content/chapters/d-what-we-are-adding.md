Our cluster currently looks roughly like:

```text
Application
    |
    v
Kubernetes API
    |
    +--> Deployment controller
    |
    +--> Service objects
    |
    +--> NetworkPolicy
    |
    v
Cilium
    |
    +--> CNI
    |
    +--> NetworkPolicy enforcement
    |
    +--> kube-proxy replacement
    |
    v
eBPF dataplane
```

We are going to add L7 routing:

```text
Client
  |
  v
Gateway
  |
  v
Cilium Gateway controller
  |
  v
Envoy
  |
  v
HTTPRoute
  |
  v
Service
  |
  v
Pod
```

Gateway API separates concerns more cleanly than the original Ingress model.

The important resource chain is:

```text
GatewayClass
     |
     v
Gateway
     |
     v
HTTPRoute
     |
     v
Service
     |
     v
Pod
```
