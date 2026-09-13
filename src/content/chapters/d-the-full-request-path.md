We can now describe a request from outside the cluster.

```text
curl
 |
 | Host: api.example.test
 v
Linux node :8080
 |
 v
Cilium / Envoy
 |
 | listener selected
 v
Gateway/public
 |
 | route selected
 v
HTTPRoute/api
 |
 | backendRef
 v
Service/api-v1
 |
 | endpoints
 v
EndpointSlice
 |
 v
Pod IP
 |
 v
Cilium dataplane
 |
 v
container
```

At the same time:

```text
Kubernetes API
      |
      +--> stores Gateway
      |
      +--> stores HTTPRoute
      |
      +--> stores Service
      |
      +--> stores EndpointSlice
      |
      v
controllers observe
      |
      v
lower-level state changes
```

That is Kubernetes reconciliation expressed as networking.
