Gateway API deliberately makes cross-namespace references explicit.

Create another namespace:

```bash
kubectl create namespace payments
```

Create a backend there:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments
  namespace: payments
spec:
  replicas: 1
  selector:
    matchLabels:
      app: payments
  template:
    metadata:
      labels:
        app: payments
    spec:
      containers:
        - name: web
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              mkdir -p /www
              echo "hello from payments" > /www/index.html
              httpd -f -p 8080 -h /www
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: payments
  namespace: payments
spec:
  selector:
    app: payments
  ports:
    - port: 80
      targetPort: 8080
```

Save as:

```text
payments.yaml
```

Apply:

```bash
kubectl apply -f payments.yaml
```

Now point our route at it:

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
        - name: payments
          namespace: payments
          port: 80
```

Apply:

```bash
kubectl apply -f route.yaml
```

Inspect:

```bash
kubectl describe httproute api
```

The reference should not be considered valid merely because the Service exists.

Why?

The route lives in:

```text
gateway-lab
```

but wants to reference a Service in:

```text
payments
```

Gateway API requires the target namespace to explicitly permit that reference.

Create:

```yaml
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-gateway-lab
  namespace: payments
spec:

  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: gateway-lab

  to:
    - group: ""
      kind: Service
      name: payments
```

Save as:

```text
referencegrant.yaml
```

Apply:

```bash
kubectl apply -f referencegrant.yaml
```

Inspect the route again:

```bash
kubectl describe httproute api
```

Then test:

```bash
curl \
  -H 'Host: api.example.test' \
  "http://${GATEWAY_NODE_IP}:8080/"
```

Expected:

```text
hello from payments
```

The security boundary is:

```text
gateway-lab HTTPRoute
        |
        | asks to reference
        v
payments/Service
        |
        X
not allowed by default
        |
        v
ReferenceGrant in payments
        |
        v
reference accepted
```

The target namespace owns the permission.

That is a powerful multi-team platform primitive.
