Gateway API is not built into Kubernetes core as a set of automatically available resources.

Install the Gateway API 1.6.1 standard channel:

```bash
kubectl apply --server-side \
  -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
```

Discover the new APIs:

```bash
kubectl api-resources \
  --api-group=gateway.networking.k8s.io
```

You should see resources including:

```text
gatewayclasses
gateways
httproutes
grpcroutes
referencegrants
```

Ask the API:

```bash
kubectl explain gateway
```

Then:

```bash
kubectl explain httproute.spec
```

This should feel familiar from the CKAD cookbook.

We installed new API types.

We have not yet proven that anything implements them.
