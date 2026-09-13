Create:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: public
spec:
  gatewayClassName: cilium

  listeners:
    - name: http
      protocol: HTTP
      port: 8080
      hostname: api.example.test

      allowedRoutes:
        namespaces:
          from: Same
```

Save as:

```text
gateway.yaml
```

Apply:

```bash
kubectl apply -f gateway.yaml
```

Inspect:

```bash
kubectl get gateway public
```

Then:

```bash
kubectl describe gateway public
```

Look at:

```text
Status
Conditions
Addresses
Listeners
```

Query conditions:

```bash
kubectl get gateway public \
  -o jsonpath='{range .status.conditions[*]}{.type}={.status}{" reason="}{.reason}{"\n"}{end}'
```

We want conditions indicating the Gateway has been accepted and programmed.

The object path is:

```text
Gateway
   |
   v
Kubernetes API
   |
   v
Cilium Gateway controller
   |
   v
Envoy listener :8080
```
