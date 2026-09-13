An Argo CD `Application` tells Argo:

```text
where desired state lives
       +
what path to render
       +
where to deploy it
```

Create one:

```bash
cat > /tmp/web-dev-application.yaml <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: web-dev
  namespace: argocd
spec:
  project: default
  source:
    repoURL: ${GITOPS_REPO}
    targetRevision: main
    path: environments/dev/web
  destination:
    server: https://kubernetes.default.svc
    namespace: web-dev
  syncPolicy:
    syncOptions:
      - CreateNamespace=true
EOF
```

Apply it:

```bash
kubectl apply -f /tmp/web-dev-application.yaml
```

Inspect it:

```bash
kubectl get application web-dev -n argocd
```

Watch its status:

```bash
kubectl get application web-dev \
  -n argocd \
  -w
```

Because we have not enabled automated sync, Argo should discover that Git and the cluster differ.

Inspect the sync state directly:

```bash
kubectl get application web-dev \
  -n argocd \
  -o jsonpath='{.status.sync.status}{"\n"}'
```

You should see:

```text
OutOfSync
```

That is the GitOps equivalent of seeing:

```text
spec != actual state
```

## Enable reconciliation

Patch the Application so Argo may automatically sync:

```bash
kubectl patch application web-dev \
  -n argocd \
  --type merge \
  -p '{
    "spec": {
      "syncPolicy": {
        "automated": {},
        "syncOptions": ["CreateNamespace=true"]
      }
    }
  }'
```

Watch the namespace appear:

```bash
kubectl get namespace web-dev -w
```

Then inspect the workload:

```bash
kubectl get deployment,service,pods \
  -n web-dev
```

Argo has now performed the equivalent of:

```bash
kubectl apply -k environments/dev/web
```

but the important difference is ownership of the workflow.

You did not execute that command against the environment.

The controller read Git and reconciled the cluster.
