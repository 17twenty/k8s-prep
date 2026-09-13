When Gateway traffic fails, debug from the API downward.

Do not begin with packet captures.

Use this order:

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
EndpointSlice
     |
     v
Pod readiness
     |
     v
Cilium / Envoy
     |
     v
Hubble
     |
     v
Linux dataplane
```

Useful commands:

```bash
kubectl get gatewayclass
```

```bash
kubectl describe gateway public
```

```bash
kubectl describe httproute api
```

```bash
kubectl get service api-v1
```

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api-v1
```

```bash
kubectl get pods \
  -l app=api-v1 \
  -o wide
```

```bash
cilium status
```

```bash
hubble observe -P --last 30
```

Only go further down once the upper layer is known to be correct.
