So far our Application uses:

```yaml
project: default
```

The default Argo project is intentionally permissive and useful for getting started.

It is not a good final tenancy model.

Create a dedicated project:

```bash
cat > /tmp/web-project.yaml <<EOF
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: web-team
  namespace: argocd
spec:
  description: Web team applications
  sourceRepos:
    - ${GITOPS_REPO}
  destinations:
    - namespace: web-*
      server: https://kubernetes.default.svc
EOF
```

Apply it:

```bash
kubectl apply -f /tmp/web-project.yaml
```

Move the Application into it:

```bash
kubectl patch application web-dev \
  -n argocd \
  --type merge \
  -p '{"spec":{"project":"web-team"}}'
```

Inspect:

```bash
kubectl get appproject web-team \
  -n argocd \
  -o yaml
```

Now Argo has two layers of authority:

```text
Kubernetes RBAC
      |
      v
what Argo's ServiceAccount can do

AppProject policy
      |
      v
what applications in this project are permitted to request
```

That distinction matters.

An AppProject can constrain:

```text
trusted source repositories
target clusters
target namespaces
resource kinds
Argo user/team roles
```

## A dangerous boundary

Do not casually permit application projects to deploy into the `argocd` namespace itself.

An application able to modify Argo's own configuration or credentials can potentially turn application deployment permission into platform administration.

This is the same privilege-escalation reasoning we used in the Kubernetes RBAC chapter.
