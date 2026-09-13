When finished, return to the CKAD context:

```bash
kubectl config use-context kind-ckad
```

Delete the entire Kamaji learning environment:

```bash
kind delete cluster --name kamaji
```

Remove the temporary tenant kubeconfig:

```bash
rm -f /tmp/kamaji-tenant.conf
```

Your original cookbook cluster remains available.
