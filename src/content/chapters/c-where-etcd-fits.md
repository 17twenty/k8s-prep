Inspect:

```bash
kubectl get pod \
  -n kube-system \
  -l component=etcd \
  -o wide
```

Normal API clients do not talk directly to etcd.

Think:

```text
kubectl
   |
   v
API server
   |
   v
etcd
```

Controllers also communicate through the API server.

The API server is the front door to cluster state.

That is why:

```text
Kubernetes is an API-driven control system
```

is more useful than:

```text
Kubernetes runs containers
```
