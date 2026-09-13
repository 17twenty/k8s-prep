Reapply the Cilium L7 policy:

```bash
kubectl apply -f cilium-l7-policy.yaml
```

Generate an allowed request:

```bash
kubectl exec restricted-client -- \
  curl -s http://l7-api/allowed
```

Generate a denied request:

```bash
kubectl exec restricted-client -- \
  curl -s http://l7-api/denied || true
```

Inspect Hubble:

```bash
hubble observe -P \
  --pod gateway-lab/l7-api \
  --last 30
```

Now we can tie together:

```text
CiliumNetworkPolicy
       |
       v
policy calculation
       |
       v
Envoy / dataplane enforcement
       |
       v
Hubble flow event
```

Delete the policy:

```bash
kubectl delete ciliumnetworkpolicy l7-api-policy
```
