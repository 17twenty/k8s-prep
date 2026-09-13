Create:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api
spec:

  parentRefs:
    - name: public

  hostnames:
    - api.example.test

  rules:
    - backendRefs:
        - name: api-v1
          port: 80
```

Save as:

```text
route.yaml
```

Apply:

```bash
kubectl apply -f route.yaml
```

Inspect:

```bash
kubectl get httproute api
```

Then:

```bash
kubectl describe httproute api
```

Query status:

```bash
kubectl get httproute api \
  -o jsonpath='{range .status.parents[*].conditions[*]}{.type}={.status}{" reason="}{.reason}{"\n"}{end}'
```

The complete chain is now:

```text
GatewayClass/cilium
        |
        v
Gateway/public
        |
        v
HTTPRoute/api
        |
        v
Service/api-v1
        |
        v
EndpointSlice
        |
        v
Pods
```

Notice how much of this is still ordinary Kubernetes API composition.
