Remember that the Kubernetes node is actually a container.

Ask Docker:

```bash
docker ps
```

You should see:

```text
ckad-control-plane
```

So the relationship is:

```text
kubectl
   |
   v
Kubernetes API
   |
   v
ckad-control-plane
   |
   v
Docker container
```

From this point onwards, mostly forget about Docker.

Interact with the cluster through the Kubernetes API.
