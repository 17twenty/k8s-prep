A Deployment asks for an arbitrary number of replicas.

Some software instead needs to run on every relevant node.

Examples include:

- CNI agents
- storage agents
- log collectors
- node monitoring

That is what a DaemonSet expresses.

Save as `daemonset.yaml`:

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-demo
spec:
  selector:
    matchLabels:
      app: node-demo
  template:
    metadata:
      labels:
        app: node-demo
    spec:
      containers:
        - name: sleeper
          image: busybox:1.36
          command: ["sh", "-c", "sleep 3600"]
```

Apply:

```bash
kubectl apply -f daemonset.yaml
```

Observe:

```bash
kubectl get daemonset node-demo
kubectl get pods -l app=node-demo -o wide
kubectl get nodes
```

On a simple untainted lab cluster you will often see roughly one Pod per eligible node.

The important distinction is:

```text
Deployment
    -> desired replica count

DaemonSet
    -> desired eligible-node coverage
```

Cleanup:

```bash
kubectl delete daemonset node-demo
rm -f daemonset.yaml
```
