Create another namespace from inside Alice's cluster:

```bash
kubectl create namespace apps
```

Deploy nginx:

```bash
kubectl create deployment web \
  --image=nginx:1.27-alpine \
  -n apps
```

Watch it:

```bash
kubectl get pods \
  -n apps \
  -o wide
```

From Alice's perspective this is just Kubernetes:

```text
Alice
  |
  v
POST Deployment to tenant API
  |
  v
Deployment controller
  |
  v
ReplicaSet
  |
  v
Pod
```

But shared-node vCluster has another layer underneath.

Let's look behind the curtain.
