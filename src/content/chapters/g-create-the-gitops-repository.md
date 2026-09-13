We need a Git repository Argo CD can read.

For the first lab, make it public so repository authentication does not distract from the reconciliation model.

Later we will discuss private repositories and production credentials.

Set your GitHub username:

```bash
export GITHUB_USER="YOUR_GITHUB_USERNAME"
```

Choose a repository name:

```bash
export GITOPS_REPO_NAME="platform-gitops"
export GITOPS_REPO="https://github.com/${GITHUB_USER}/${GITOPS_REPO_NAME}.git"
```

Create a working directory:

```bash
mkdir -p ~/gitops-lab/platform-gitops
cd ~/gitops-lab/platform-gitops

git init -b main
```

Create the initial structure:

```bash
mkdir -p apps/web/base
mkdir -p environments/dev/web
```

Create the base Deployment:

```bash
cat > apps/web/base/deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: example/web:bootstrap
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 1
            periodSeconds: 3
EOF
```

Create the Service:

```bash
cat > apps/web/base/service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
EOF
```

Create the base Kustomization:

```bash
cat > apps/web/base/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
EOF
```

Now create the development overlay:

```bash
cat > environments/dev/web/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: web-dev
resources:
  - ../../../apps/web/base
images:
  - name: example/web
    newName: nginx
    newTag: 1.27-alpine
EOF
```

Render it locally:

```bash
kubectl kustomize environments/dev/web
```

Notice what happened to:

```yaml
image: example/web:bootstrap
```

The overlay changed it to:

```yaml
image: nginx:1.27-alpine
```

The Git repository now contains enough information to describe the development environment.

Commit it:

```bash
git add .
git commit -m "bootstrap web development environment"
```

## Push it

If you use GitHub CLI:

```bash
gh auth status
```

Create a public repository and push:

```bash
gh repo create "${GITOPS_REPO_NAME}" \
  --public \
  --source=. \
  --remote=origin \
  --push
```

Otherwise create the repository through your Git provider and push it normally.

At this point:

```text
Git contains desired state

but

nothing is reconciling it yet
```
