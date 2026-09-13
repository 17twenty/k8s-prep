Cilium does not require applications to use Cilium-specific policy objects.

The normal Kubernetes API still works:

```text
networking.k8s.io/v1
NetworkPolicy
```

Create another in-cluster client:

```bash
kubectl run restricted-client \
  --image=curlimages/curl \
  --labels=role=client \
  --restart=Never \
  --command -- \
  sleep 3600
```

Wait:

```bash
kubectl wait \
  --for=condition=Ready \
  pod/restricted-client \
  --timeout=90s
```

Baseline:

```bash
kubectl exec restricted-client -- \
  curl -s http://api-v1
```

Create default deny for `api-v1`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-v1-deny
spec:
  podSelector:
    matchLabels:
      app: api-v1
  policyTypes:
    - Ingress
```

Save as:

```text
networkpolicy-deny.yaml
```

Apply:

```bash
kubectl apply -f networkpolicy-deny.yaml
```

Retry:

```bash
kubectl exec restricted-client -- \
  curl \
  --max-time 3 \
  http://api-v1
```

It should fail.

The portable API remains:

```text
NetworkPolicy
      |
      v
Kubernetes API
      |
      v
Cilium
      |
      v
actual enforcement
```

Delete it before continuing:

```bash
kubectl delete networkpolicy api-v1-deny
```

Verify connectivity returns:

```bash
kubectl exec restricted-client -- \
  curl -s http://api-v1
```

This is why the main CKAD cookbook keeps `NetworkPolicy` and punts the Cilium implementation detail here.
