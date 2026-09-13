Sometimes the portable Kubernetes API does not express the policy we want.

Cilium provides:

```text
CiliumNetworkPolicy
```

as a CRD for additional capabilities.

This is the point where we intentionally choose a vendor/platform-specific API.

We will enforce an HTTP-layer rule.

Create an L7 test server:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: l7-api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: l7-api
  template:
    metadata:
      labels:
        app: l7-api
    spec:
      containers:
        - name: web
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              mkdir -p /www
              echo "you reached allowed" > /www/allowed
              echo "you reached denied" > /www/denied
              httpd -f -p 8080 -h /www
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: l7-api
spec:
  selector:
    app: l7-api
  ports:
    - port: 80
      targetPort: 8080
```

Save as:

```text
l7-api.yaml
```

Apply:

```bash
kubectl apply -f l7-api.yaml
```

Baseline:

```bash
kubectl exec restricted-client -- \
  curl -s http://l7-api/allowed
```

Then:

```bash
kubectl exec restricted-client -- \
  curl -s http://l7-api/denied
```

Both should work.

Now create:

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: l7-api-policy
spec:

  endpointSelector:
    matchLabels:
      app: l7-api

  ingress:
    - fromEndpoints:
        - matchLabels:
            role: client

      toPorts:
        - ports:
            - port: "8080"
              protocol: TCP

          rules:
            http:
              - method: GET
                path: "/allowed$"
```

Save as:

```text
cilium-l7-policy.yaml
```

Apply:

```bash
kubectl apply -f cilium-l7-policy.yaml
```

Allowed:

```bash
kubectl exec restricted-client -- \
  curl -i http://l7-api/allowed
```

Denied:

```bash
kubectl exec restricted-client -- \
  curl -i http://l7-api/denied
```

The policy is now making an L7 decision:

```text
source identity
      |
      v
TCP :8080
      |
      v
HTTP GET
      |
      v
path /allowed
      |
      +--> allow

anything else
      |
      +--> deny
```

This is functionality beyond the standard Kubernetes `NetworkPolicy` API.

That power comes with a portability tradeoff.

Delete when finished:

```bash
kubectl delete ciliumnetworkpolicy l7-api-policy
```
