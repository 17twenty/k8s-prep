Restore `route.yaml`:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api
  namespace: gateway-lab
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

Apply:

```bash
kubectl apply -f route.yaml
```
