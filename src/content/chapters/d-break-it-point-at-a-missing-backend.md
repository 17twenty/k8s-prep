Patch the route:

```bash
kubectl patch httproute api \
  --type=json \
  -p='[
    {
      "op":"replace",
      "path":"/spec/rules/0/backendRefs/0/name",
      "value":"api-does-not-exist"
    }
  ]'
```

Inspect:

```bash
kubectl describe httproute api
```

Pay attention to route conditions.

You should see that the route cannot completely resolve its references.

Query:

```bash
kubectl get httproute api \
  -o jsonpath='{range .status.parents[*].conditions[*]}{.type}={.status}{" reason="}{.reason}{" message="}{.message}{"\n"}{end}'
```

Try traffic:

```bash
curl \
  -H 'Host: api.example.test' \
  "http://${GATEWAY_NODE_IP}:8080/"
```

Do not start debugging at Envoy.

Start at the API:

```text
Gateway
   |
   v
HTTPRoute
   |
   v
backendRef
   |
   X
Service missing
```

Fix it:

```bash
kubectl patch httproute api \
  --type=json \
  -p='[
    {
      "op":"replace",
      "path":"/spec/rules/0/backendRefs/0/name",
      "value":"api-v1"
    }
  ]'
```

Wait a moment and inspect again:

```bash
kubectl describe httproute api
```

Then:

```bash
curl \
  -H 'Host: api.example.test' \
  "http://${GATEWAY_NODE_IP}:8080/"
```

Expected:

```text
hello from api-v1
```

Status is part of the API contract.

Use it.
