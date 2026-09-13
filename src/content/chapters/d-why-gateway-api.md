Ingress gives us roughly:

```text
Ingress
   |
   v
Controller
   |
   v
Service
```

Gateway API makes roles explicit.

```text
Platform owns
----------------
GatewayClass
Gateway


Application team owns
---------------------
HTTPRoute
Service
Deployment
```

Think:

```text
GatewayClass
   -> Which implementation handles this?

Gateway
   -> Where and how does traffic enter?

HTTPRoute
   -> Where should HTTP requests go?

Service
   -> Which backend Pods receive them?
```

That separation becomes particularly useful in shared clusters.
