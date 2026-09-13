A Service answers:

> Where should traffic go?

A NetworkPolicy answers a different question:

> Which network flows should be allowed?

NetworkPolicy enforcement depends on the cluster's CNI plugin.

If your CNI does not enforce NetworkPolicy, the objects can exist without changing packet flow.

## Confirm current connectivity

```bash
kubectl exec client -- wget -qO- http://api
```

## Deny ingress to the API Pods

Save as `deny-api.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-api
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
```

Apply:

```bash
kubectl apply -f deny-api.yaml
```

If your CNI enforces policy, this should eventually fail:

```bash
kubectl exec client -- \
  wget -T 2 -qO- http://api
```

Why?

The selected API Pods now have ingress isolation, but no ingress rule permits the client.

## Allow only labelled clients

Label the client:

```bash
kubectl label pod client access=api
```

Replace the policy with `allow-api.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              access: api
      ports:
        - protocol: TCP
          port: 80
```

Apply:

```bash
kubectl delete networkpolicy deny-api
kubectl apply -f allow-api.yaml
```

Retry:

```bash
kubectl exec client -- wget -qO- http://api
```

This is a selector story again:

```text
NetworkPolicy podSelector
    -> which destination Pods are governed?

from.podSelector
    -> which source Pods are allowed?
```

Cleanup:

```bash
kubectl delete networkpolicy allow-api --ignore-not-found
kubectl label pod client access-
rm -f deny-api.yaml allow-api.yaml
```
