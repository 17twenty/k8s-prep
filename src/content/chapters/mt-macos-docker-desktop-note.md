On native Linux, the MetalLB address on the Docker `kind` network is often directly reachable from the host.

On macOS with Docker Desktop, the Docker bridge network may not be routed directly into macOS.

That means this can happen:

```text
TenantControlPlane     Ready
LoadBalancer IP        allocated
kubeconfig             valid

but

kubectl from macOS     cannot route to that Docker-network IP
```

Do not interpret that as Kamaji reconciliation failing.

First confirm from the management side:

```bash
kubectl --context "$KAMAJI_CONTEXT" get tcp
```

and:

```bash
kubectl --context "$KAMAJI_CONTEXT" get svc
```

The official Kamaji kind guide calls out this Docker bridge/macOS case and suggests running tenant API checks from an environment that can reach the kind Docker network, including the kind control-plane container when appropriate.

The networking lesson is useful in its own right:

```text
API exists
   !=
my current machine has a route to that API
```

Production Kamaji environments expose the API deliberately with normal LoadBalancer, DNS, Gateway or equivalent networking rather than relying on Docker Desktop bridge routing.
