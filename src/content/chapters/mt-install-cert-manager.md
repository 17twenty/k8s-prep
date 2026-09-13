Kamaji uses admission webhooks and relies on cert-manager for their TLS certificates.

Add the repository:

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
```

Install cert-manager:

```bash
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.18.3 \
  --set crds.enabled=true
```

Watch it become ready:

```bash
kubectl get pods \
  -n cert-manager \
  -w
```

Press `Ctrl-C` once the Pods are Ready.

> The pinned version above follows the current Kamaji kind walkthrough when this appendix was written. If upstream moves on, prefer the dependency versions in the current official guide.
