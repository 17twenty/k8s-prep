Replace the HTTPRoute with:

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

    - matches:
        - headers:
            - name: x-api-version
              value: v2
      backendRefs:
        - name: api-v2
          port: 80

    - backendRefs:
        - name: api-v1
          port: 80
```

Apply:

```bash
kubectl apply -f route.yaml
```

Default request:

```bash
curl \
  -H 'Host: api.example.test' \
  "http://${GATEWAY_NODE_IP}:8080/"
```

Expected:

```text
hello from api-v1
```

Version-two request:

```bash
curl \
  -H 'Host: api.example.test' \
  -H 'x-api-version: v2' \
  "http://${GATEWAY_NODE_IP}:8080/"
```

Expected:

```text
hello from api-v2
```

Now the routing decision is:

```text
Request
   |
   +-- x-api-version=v2 --> api-v2
   |
   +-- otherwise --------> api-v1
```

This is well beyond what a Kubernetes Service selector can express.
