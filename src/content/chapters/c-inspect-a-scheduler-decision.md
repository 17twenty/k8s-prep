Create:

```bash
kubectl run scheduled \
  --image=nginx:1.27-alpine
```

Query:

```bash
kubectl get pod scheduled \
  -o jsonpath='{.spec.nodeName}{"\n"}'
```

The path was:

```text
Pod submitted
     |
     v
API server
     |
     v
scheduler
     |
     | chooses node
     v
spec.nodeName
     |
     v
kubelet on chosen node
     |
     v
containerd
     |
     v
container
```

Cleanup:

```bash
kubectl delete pod scheduled
```
