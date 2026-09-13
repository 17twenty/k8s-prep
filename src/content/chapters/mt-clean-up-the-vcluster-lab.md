Before moving to Kamaji, delete Alice's vCluster:

```bash
kubectl config use-context "$HOST_CONTEXT"
```

```bash
vcluster delete alice \
  --namespace tenant-alice
```

Remove the baseline namespace too:

```bash
kubectl delete namespace shared-alice
```

Our original CKAD cluster remains intact.
