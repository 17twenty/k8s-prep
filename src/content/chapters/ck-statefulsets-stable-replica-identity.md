Deployments intentionally treat replicas as interchangeable.

Sometimes the application cares which replica is which.

Databases, clustered systems and ordered members may need stable identity.

That is the problem StatefulSets solve.

A StatefulSet can provide:

- stable Pod names
- ordered creation and termination
- stable network identity when paired with a headless Service
- per-replica persistent storage through volume claim templates

## Small identity experiment

Save as `stateful.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: stateful-web
spec:
  clusterIP: None
  selector:
    app: stateful-web
  ports:
    - port: 80
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: stateful-web
spec:
  serviceName: stateful-web
  replicas: 3
  selector:
    matchLabels:
      app: stateful-web
  template:
    metadata:
      labels:
        app: stateful-web
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
```

Apply:

```bash
kubectl apply -f stateful.yaml
```

Observe:

```bash
kubectl get statefulsets
kubectl get pods -l app=stateful-web
```

Pod names are predictable:

```text
stateful-web-0
stateful-web-1
stateful-web-2
```

Delete one:

```bash
kubectl delete pod stateful-web-1
```

Observe:

```bash
kubectl get pods -l app=stateful-web -w
```

The replacement is still:

```text
stateful-web-1
```

Compare with Deployment-generated Pod names.

The point is not that StatefulSet Pods are immortal.

They are still replaceable.

The point is that their **identity is stable across replacement**.

Cleanup:

```bash
kubectl delete -f stateful.yaml
rm -f stateful.yaml
```
