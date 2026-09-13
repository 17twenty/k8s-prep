Our Deployment Pods are intentionally disposable.

That creates a networking problem.

A Pod can disappear and its replacement can have a different IP address.

Clients therefore need something more stable than a Pod IP.

A **Service** provides a stable virtual endpoint over a selected set of backends.

Conceptually:

```text
Client
  |
  v
Service
  |
  v
EndpointSlice
  |
  +-- Pod
  +-- Pod
  +-- Pod
```

## Expose the Deployment

```bash
kubectl expose deployment api \
  --name=api \
  --port=80 \
  --target-port=80
```

Inspect:

```bash
kubectl get service api
kubectl describe service api
```

The important distinction is:

```text
port       -> port clients use on the Service
targetPort -> port the application receives traffic on
```

## How does the Service find Pods?

Query its selector:

```bash
kubectl get service api \
  -o jsonpath='{.spec.selector}{"\n"}'
```

You should see something equivalent to:

```text
map[app:api]
```

Check matching Pods:

```bash
kubectl get pods -l app=api --show-labels
```

The Service does not contain a permanent list of those Pod IPs.

It declares a selector.

Another controller continuously maintains the backend endpoint data.

There is our reconciliation model again.
