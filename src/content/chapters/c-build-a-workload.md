Return to familiar Kubernetes APIs.

Create:

```bash
kubectl create deployment web \
  --image=nginx:1.27-alpine \
  --replicas=2
```

Expose:

```bash
kubectl expose deployment web \
  --port=80
```

Observe:

```bash
kubectl get pods \
  -o wide
```

Then:

```bash
kubectl get service web
```

Create a client:

```bash
kubectl run client \
  --image=curlimages/curl \
  --restart=Never \
  --command -- \
  sleep 3600
```

Wait:

```bash
kubectl wait \
  --for=condition=Ready \
  pod/client \
  --timeout=90s
```

Call the Service:

```bash
kubectl exec client -- \
  curl -s http://web
```

You should receive the NGINX page.

There is still no kube-proxy.

Inspect Cilium's Service table:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg service list
```

Look for the ClusterIP belonging to:

```text
web
```

The object path is:

```text
Service
   |
   v
Kubernetes API
   |
   v
Cilium observes it
   |
   v
eBPF service state
   |
   v
backend Pods
```

The reconciliation model from the CKAD cookbook now reaches all the way into the network dataplane.
