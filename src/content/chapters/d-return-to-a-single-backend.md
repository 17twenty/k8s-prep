Restore:

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

Apply:

```bash
kubectl apply -f route.yaml
```
