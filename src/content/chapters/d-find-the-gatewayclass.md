Check:

```bash
kubectl get gatewayclass
```

You should see:

```text
cilium
```

Inspect:

```bash
kubectl describe gatewayclass cilium
```

The relationship is:

```text
GatewayClass/cilium
        |
        v
Cilium Gateway controller
```

`GatewayClass` is cluster-scoped.

It tells Kubernetes which implementation is responsible for Gateways using that class.
