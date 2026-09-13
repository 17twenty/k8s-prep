Now deliberately break the selector.

First prove the application works:

```bash
kubectl exec client -- wget -qO- http://api
```

Inspect current endpoints:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api
```

## Break the selector

```bash
kubectl patch service api \
  --type=merge \
  -p '{"spec":{"selector":{"app":"broken"}}}'
```

Now ask for endpoint addresses:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api \
  -o jsonpath='{.items[*].endpoints[*].addresses[*]}{"\n"}'
```

Try the request:

```bash
kubectl exec client -- \
  wget -T 2 -qO- http://api
```

It should fail.

Why?

```text
Service selector = app=broken

Pods = app=api

No match
   |
   v
No ready backend endpoints
```

## Fix desired state

```bash
kubectl patch service api \
  --type=merge \
  -p '{"spec":{"selector":{"app":"api"}}}'
```

Verify:

```bash
kubectl exec client -- wget -qO- http://api
```

## A useful Service debugging order

When DNS resolves but traffic fails, walk the path rather than trying random commands:

```text
Service
  |
  | selector and ports correct?
  v
Pod labels
  |
  | selector matches?
  v
EndpointSlice
  |
  | ready addresses present?
  v
Pod readiness
  |
  | endpoint considered ready?
  v
application port
  |
  | process actually listening?
  v
application
```

We will revisit this after adding readiness probes.
