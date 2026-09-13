Delete Gateway resources:

```bash
kubectl delete httproute api \
  --ignore-not-found

kubectl delete gateway public \
  --ignore-not-found
```

Delete application resources:

```bash
kubectl delete deployment \
  api-v1 \
  api-v2 \
  l7-api \
  --ignore-not-found

kubectl delete service \
  api-v1 \
  api-v2 \
  l7-api \
  --ignore-not-found

kubectl delete pod \
  client \
  restricted-client \
  --ignore-not-found
```

Delete cross-namespace resources:

```bash
kubectl delete namespace payments \
  --ignore-not-found
```

Delete the lab namespace:

```bash
kubectl delete namespace gateway-lab
```

Switch your current context back to default:

```bash
kubectl config set-context \
  --current \
  --namespace=default
```

We normally leave the Gateway API CRDs and Cilium installation in place because they are cluster-level platform components.

For a fully disposable lab, reset the cluster using Appendix C instead.
