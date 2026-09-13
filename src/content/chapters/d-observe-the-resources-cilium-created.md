Start with Kubernetes:

```bash
kubectl get gateway
kubectl get httproute
kubectl get svc
```

Inspect Cilium:

```bash
cilium status
```

Inspect Envoy-related resources:

```bash
kubectl get ciliumenvoyconfigs \
  -A
```

Depending on Cilium's generated configuration and version, you should see resources representing L7 proxy configuration.

This is an important transition.

The application developer created:

```text
Gateway
HTTPRoute
```

The implementation created lower-level configuration needed to make those resources real.

Conceptually:

```text
HTTPRoute
    |
    v
Kubernetes API
    |
    v
Cilium controller
    |
    v
Envoy configuration
    |
    v
listener / routes / clusters
    |
    v
actual HTTP traffic
```
