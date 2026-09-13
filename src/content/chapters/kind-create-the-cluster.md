The cookbook targets Kubernetes 1.35.

Create a cluster called `ckad` using Kubernetes 1.35:

```bash
kind create cluster \
  --name ckad \
  --image kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0 \
  --wait 2m
```

`kind` will:

```text
create a container
        |
        v
turn it into a Kubernetes node
        |
        v
bootstrap Kubernetes
        |
        v
write kubeconfig
        |
        v
switch kubectl to the new cluster
```

Check:

```bash
kind get clusters
```

Expected:

```text
ckad
```

Check your Kubernetes context:

```bash
kubectl config current-context
```

Expected:

```text
kind-ckad
```

---

## Observe the Cluster

Ask Kubernetes what nodes exist:

```bash
kubectl get nodes
```

You should see something similar to:

```text
NAME                 STATUS   ROLES           AGE   VERSION
ckad-control-plane   Ready    control-plane   1m    v1.35.x
```

More detail:

```bash
kubectl get nodes -o wide
```

Check the control plane:

```bash
kubectl cluster-info
```

And see the system workloads Kubernetes created:

```bash
kubectl get pods -n kube-system
```

At this point you have a real Kubernetes API to experiment with.
