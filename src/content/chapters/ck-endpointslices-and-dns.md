A common simplified drawing is:

```text
Service -> Pods
```

Useful, but incomplete.

For Services with selectors, Kubernetes normally maintains **EndpointSlices** containing matching backend endpoints.

## Inspect EndpointSlices

```bash
kubectl get endpointslices
```

Filter for our Service:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api
```

Show addresses:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api \
  -o jsonpath='{.items[*].endpoints[*].addresses[*]}{"\n"}'
```

Compare with Pod IPs:

```bash
kubectl get pods \
  -l app=api \
  -o custom-columns='NAME:.metadata.name,IP:.status.podIP'
```

The addresses should correspond.

The relationship is closer to:

```text
Service selector
      |
      v
matching Pods
      |
      v
EndpointSlice controller
      |
      v
EndpointSlices
      |
      v
networking implementation
```

## Create a client Pod

We need something inside the cluster to test cluster networking.

```bash
kubectl run client \
  --image=busybox:1.36 \
  --restart=Never \
  --labels=app=client \
  --command -- sleep 3600
```

Wait until it is ready:

```bash
kubectl wait \
  --for=condition=Ready \
  pod/client \
  --timeout=60s
```

## Service DNS

Resolve the Service:

```bash
kubectl exec client -- nslookup api
```

Call it:

```bash
kubectl exec client -- wget -qO- http://api
```

Try the namespace-qualified name:

```bash
kubectl exec client -- \
  wget -qO- http://api.cookbook
```

A conventional fully qualified Service name is:

```text
api.cookbook.svc.cluster.local
```

You normally use the shortest name that is unambiguous.

Inside the same namespace:

```text
api
```

is usually enough.

## Compare Service and port-forward

A Service is persistent cluster configuration:

```text
Pod replacement
     |
     v
endpoint set changes
     |
     v
Service identity remains
```

A port-forward is a temporary developer/debug tunnel.

Do not confuse them.
