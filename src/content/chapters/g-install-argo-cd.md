Create its namespace:

```bash
kubectl create namespace argocd
```

Install the standard non-HA manifests:

```bash
kubectl apply \
  --server-side \
  --force-conflicts \
  -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Wait for the API/UI server:

```bash
kubectl rollout status \
  deployment/argocd-server \
  -n argocd \
  --timeout=300s
```

See what was installed:

```bash
kubectl get pods -n argocd
```

You should see several controllers and supporting components.

Argo CD is itself a Kubernetes application.

That matters because everything we learned earlier still applies:

```text
Pods
Services
ServiceAccounts
RBAC
CRDs
controllers
status
```

## Look at the new API

Argo installed CustomResourceDefinitions.

Find them:

```bash
kubectl get crd | grep argoproj
```

The important one initially is:

```text
applications.argoproj.io
```

Ask Kubernetes about it:

```bash
kubectl explain application.spec
```

We have extended the Kubernetes API with a new desired-state object.

## Optional: open the UI

Forward the Argo CD API server:

```bash
kubectl port-forward \
  -n argocd \
  svc/argocd-server \
  8080:443
```

Retrieve the initial admin password from another terminal:

```bash
kubectl -n argocd get secret \
  argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' \
  | base64 -d

echo
```

Then browse to:

```text
https://127.0.0.1:8080
```

Username:

```text
admin
```

The UI is useful, but do not let it hide the API from you.

Throughout this handbook we will keep inspecting the underlying Kubernetes resources.
