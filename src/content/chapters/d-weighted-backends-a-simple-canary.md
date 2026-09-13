Replace the route rules with:

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
          weight: 90

        - name: api-v2
          port: 80
          weight: 10
```

Apply:

```bash
kubectl apply -f route.yaml
```

Send several requests:

```bash
for i in $(seq 1 30); do
  curl -s \
    -H 'Host: api.example.test' \
    "http://${GATEWAY_NODE_IP}:8080/"
done | sort | uniq -c
```

You should see requests reaching both versions.

Do not expect exactly 90/10 over a tiny sample.

The important difference from the simple canary in the CKAD cookbook is:

```text
Old approach
------------

9 Pods stable
1 Pod canary

Service selects all 10


Gateway API approach
--------------------

HTTPRoute
  |
  +-- weight 90 -> Service v1
  |
  +-- weight 10 -> Service v2
```

The routing intent is now explicit in the API.
