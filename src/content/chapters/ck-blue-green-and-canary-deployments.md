A Deployment's rolling update strategy is not the only way to release software.

Two common patterns are blue-green and canary.

The interesting Kubernetes lesson is that both can be built from primitives we already understand: Deployments, labels and Services.

## Blue-green: switch the Service selector

Create two versions with explicit Pod labels.

Save as `blue-green.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop-blue
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shop
      release: blue
  template:
    metadata:
      labels:
        app: shop
        release: blue
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop-green
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shop
      release: green
  template:
    metadata:
      labels:
        app: shop
        release: green
    spec:
      containers:
        - name: nginx
          image: nginx:1.28-alpine
---
apiVersion: v1
kind: Service
metadata:
  name: shop
spec:
  selector:
    app: shop
    release: blue
  ports:
    - port: 80
      targetPort: 80
```

Apply:

```bash
kubectl apply -f blue-green.yaml
```

See which Pods are selected:

```bash
kubectl get pods -l app=shop --show-labels
kubectl get endpointslices \
  -l kubernetes.io/service-name=shop
```

Initially the Service selects blue.

Switch to green:

```bash
kubectl patch service shop \
  --type=merge \
  -p '{"spec":{"selector":{"app":"shop","release":"green"}}}'
```

Inspect endpoints again:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=shop
```

The release switch was a selector change.

That is blue-green in its simplest Kubernetes form.

Cleanup:

```bash
kubectl delete -f blue-green.yaml
rm -f blue-green.yaml
```

## Canary: two versions behind one Service

A crude Kubernetes-only canary can run two Deployments with the same Service selector.

Conceptually:

```text
stable Deployment: 9 replicas
canary Deployment: 1 replica

both Pods:
  app=shop

Service selector:
  app=shop
```

Roughly one tenth of the available backend Pods would be canary Pods.

This is **not precise request weighting**.

A plain Service does not promise exact percentages, user affinity, header matching or request-level policy.

Those features generally require an ingress controller, gateway, service mesh or another higher-level traffic-routing system.

The lesson is to understand what the primitive actually guarantees rather than reading more into it.
