# GitOps and Platform Delivery for Kubernetes

A hands-on companion to the Kubernetes cookbook.

The Kubernetes cookbook teaches you how Kubernetes reconciles desired state into running workloads.

This handbook takes the next step:

> How does application code safely become desired state in a real cluster?

The goal is not to memorise Argo CD commands.

The goal is to understand a modern delivery system well enough that you can reason about it, debug it, secure it, and eventually build a platform around it.

We will build this path:

```text
developer
   |
   | git push / pull request
   v
application repository
   |
   | CI tests, builds, scans
   v
OCI registry
   |
   | immutable image + digest
   v
promotion pull request
   |
   v
GitOps repository
   |
   | reviewed desired-state change
   v
Argo CD
   |
   | reconciliation
   v
Kubernetes API
   |
   v
Argo Rollouts
   |
   | canary / blue-green / analysis / promotion
   v
running application
```

By the end, we will have replaced the classic pipeline:

```text
CI job
  |
  | kubectl apply
  | cluster-admin kubeconfig
  v
production
```

with:

```text
CI
 |
 +-- builds an artifact
 +-- signs / attests it
 +-- proposes a desired-state change
 |
 v
Git pull request
 |
 | human / policy review
 v
Git
 |
 | pulled by controller
 v
cluster
```

Sections are marked:

- **[DEV]** - application developer knowledge
- **[OPS]** - operating delivery systems
- **[PLATFORM]** - platform engineering and multi-team design
- **[DEEP DIVE]** - concepts worth understanding beyond the immediate lab

The recurring teaching loop is the same as the main Kubernetes cookbook:

```text
problem
  |
  v
mental model
  |
  v
small experiment
  |
  v
observe the controllers
  |
  v
change one thing
  |
  v
observe the consequence
  |
  v
break an assumption
  |
  v
explain why
```

---

# Part I - Git Becomes Desired State

# 0. Lab Setup [DEV] [OPS]

This handbook assumes you completed enough of the Kubernetes cookbook to be comfortable with:

- Deployments and Services
- `spec` versus `status`
- rollouts and ReplicaSets
- RBAC
- Kustomize
- container images
- `kind`

The examples assume the existing lab cluster:

```bash
kubectl config use-context kind-ckad
```

Check it:

```bash
kubectl get nodes
```

We will install platform components into their own namespaces rather than the cookbook namespace.

Useful local tools:

```text
git
kubectl
docker
kind
```

For the complete hosted Git workflow, a GitHub account is convenient.

Optional but useful on macOS:

```bash
brew install gh argocd
```

Argo Rollouts will be installed later.

## Two repositories, not one

We will eventually use two repositories:

```text
web-app
  |
  +-- application source
  +-- Dockerfile
  +-- tests
  +-- CI workflow

platform-gitops
  |
  +-- Kubernetes desired state
  +-- environment overlays
  +-- image digest promoted to each environment
  +-- Argo CD Application definitions
```

That separation is intentional.

The application repository answers:

> What software should we build?

The GitOps repository answers:

> What exact version of that software should this environment run?

Those are different decisions.

---

# 1. Why GitOps Exists [DEV] [OPS]

Suppose CI does this after every merge:

```bash
docker build -t registry.example.com/web:latest .
docker push registry.example.com/web:latest
kubectl set image deployment/web \
  web=registry.example.com/web:latest
```

It works.

It also quietly creates several problems.

CI needs credentials capable of modifying the cluster.

The production state may differ from anything committed to Git.

A mutable tag such as `latest` does not uniquely identify the bytes being deployed.

A failed CI system can leave the cluster half-mutated.

Auditing becomes:

```text
What is running?
Who changed it?
Which pipeline ran?
Which image did latest mean at that moment?
```

GitOps changes the direction of authority.

Instead of:

```text
CI ---> cluster
```

we use:

```text
CI ---> Git
         |
         v
     controller ---> cluster
```

The cluster-side controller continuously compares:

```text
Git desired state
       |
       | compare
       v
cluster actual state
```

and reconciles differences.

If this sounds familiar, it should.

Kubernetes already taught us:

```text
spec
 |
 v
controller
 |
 v
actual state
```

GitOps adds another reconciliation layer:

```text
Git
 |
 v
GitOps controller
 |
 v
Kubernetes spec
 |
 v
Kubernetes controllers
 |
 v
actual state
```

The important idea is not "YAML in Git".

The important idea is:

> A versioned, reviewable source of desired state is continuously reconciled by software running near the target system.

---

# 2. Install Argo CD [DEV] [OPS]

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

---

# 3. Create the GitOps Repository [DEV]

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

---

# 4. Create Your First Argo CD Application [DEV] [OPS]

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

---

# 5. Drift: Change the Cluster Behind Git's Back [DEV] [OPS]

Now deliberately violate the model.

Git says:

```yaml
replicas: 2
```

Change the live Deployment:

```bash
kubectl scale deployment/web \
  -n web-dev \
  --replicas=7
```

Check:

```bash
kubectl get deployment web \
  -n web-dev
```

We now have:

```text
Git desired state:       2 replicas
cluster actual state:    7 replicas
```

Ask Argo:

```bash
kubectl get application web-dev \
  -n argocd \
  -o jsonpath='{.status.sync.status}{"\n"}'
```

After reconciliation catches up, it should report:

```text
OutOfSync
```

But notice that Argo has not necessarily repaired it.

Automated synchronization of new Git revisions and automatic repair of live drift are separate choices.

## Enable self-healing

Patch the Application:

```bash
kubectl patch application web-dev \
  -n argocd \
  --type merge \
  -p '{
    "spec": {
      "syncPolicy": {
        "automated": {
          "selfHeal": true
        },
        "syncOptions": ["CreateNamespace=true"]
      }
    }
  }'
```

Watch the Deployment:

```bash
kubectl get deployment web \
  -n web-dev \
  -w
```

It should return to:

```text
2 replicas
```

We just created the higher-level equivalent of deleting a Pod from a Deployment.

The important hierarchy is now:

```text
Git says 2
   |
   v
Argo CD restores Deployment.spec.replicas=2
   |
   v
Deployment controller restores two Pods
```

Two controllers are reconciling two different layers of desired state.

---

# 6. Pruning: What Happens When Git Deletes Something? [DEV] [OPS]

Reconciliation must answer two questions:

```text
What should exist?

and

What should no longer exist?
```

Create a ConfigMap in Git:

```bash
cd ~/gitops-lab/platform-gitops

cat > apps/web/base/banner.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-banner
data:
  message: hello-from-git
EOF
```

Add it to the base Kustomization:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path("apps/web/base/kustomization.yaml")
s = p.read_text()
if "  - banner.yaml\n" not in s:
    s = s.replace("  - service.yaml\n", "  - service.yaml\n  - banner.yaml\n")
p.write_text(s)
PY
```

Commit and push:

```bash
git add .
git commit -m "add banner config"
git push
```

Wait for Argo:

```bash
kubectl get configmap web-banner \
  -n web-dev \
  -w
```

Now remove the object from Git:

```bash
rm apps/web/base/banner.yaml

python3 - <<'PY'
from pathlib import Path
p = Path("apps/web/base/kustomization.yaml")
s = p.read_text().replace("  - banner.yaml\n", "")
p.write_text(s)
PY

git add .
git commit -m "remove banner config"
git push
```

Inspect the cluster:

```bash
kubectl get configmap web-banner \
  -n web-dev
```

If automated pruning is disabled, the object may remain even though Git no longer declares it.

The Application becomes out of sync.

## Enable pruning

Patch the Application:

```bash
kubectl patch application web-dev \
  -n argocd \
  --type merge \
  -p '{
    "spec": {
      "syncPolicy": {
        "automated": {
          "prune": true,
          "selfHeal": true
        },
        "syncOptions": ["CreateNamespace=true"]
      }
    }
  }'
```

Argo should now remove resources that were previously managed but no longer exist in desired state.

Check:

```bash
kubectl get configmap web-banner \
  -n web-dev
```

Expected:

```text
NotFound
```

Pruning is powerful.

In production, think carefully before allowing automatic pruning of high-impact resources such as namespaces, storage resources, or shared infrastructure.

Argo also supports requiring explicit confirmation before certain prune/delete operations.

---

# Part II - Build Once, Promote an Immutable Artifact

# 7. The Application Repository [DEV]

So far our GitOps repository deploys public nginx.

Now we will build our own application.

Create a separate repository:

```bash
mkdir -p ~/gitops-lab/web-app
cd ~/gitops-lab/web-app

git init -b main
```

Create a page:

```bash
cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <h1>GitOps demo</h1>
    <p>version: v1</p>
  </body>
</html>
EOF
```

Create the image:

```bash
cat > Dockerfile <<'EOF'
FROM nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/index.html
EOF
```

Build it locally:

```bash
docker build -t web-app:dev .
```

Run it:

```bash
docker run --rm \
  -p 8081:80 \
  web-app:dev
```

From another terminal:

```bash
curl http://127.0.0.1:8081
```

We now have application source that can become an immutable OCI artifact.

Commit it:

```bash
git add .
git commit -m "initial web application"
```

Create and push the hosted repository if you want to follow the CI lab:

```bash
gh repo create web-app \
  --public \
  --source=. \
  --remote=origin \
  --push
```

---

# 8. Tags Are Labels; Digests Identify Bytes [DEV] [OPS]

A container tag is a convenient name:

```text
web:v1
web:sha-2f41c2b
web:stable
```

A registry may move a tag so that it points at a different artifact.

A digest identifies content:

```text
sha256:9d47...
```

Kubernetes can deploy either:

```yaml
image: registry.example.com/team/web:v1
```

or:

```yaml
image: registry.example.com/team/web@sha256:9d47...
```

For a promotion system, the second form is much stronger.

The Git commit then says:

> Run these exact image bytes.

not:

> Ask the registry what `v1` means today.

## Recommended pattern

Build one artifact.

Attach useful tags for humans:

```text
sha-<git commit>
v1.4.3
release-2026-09-13
```

But promote the immutable digest:

```text
registry.example.com/team/web@sha256:...
```

That gives us both:

```text
human discoverability
       +
immutable deployment identity
```

Avoid production deployments using:

```text
:latest
```

because it intentionally hides which artifact is meant.

---

# 9. Registry Choices: GHCR for the Lab, Harbor for a Platform [DEV] [PLATFORM]

GitOps does not require a particular OCI registry.

For the easiest hosted lab, GitHub Container Registry gives us CI and registry authentication from the same GitHub account.

A platform often uses something such as Harbor because it adds features useful to operators:

```text
projects
robot accounts
retention
immutability
vulnerability scanning
SBOM generation
signatures / content trust
replication
```

The delivery architecture remains identical:

```text
CI build
  |
  v
OCI registry
  |
  v
immutable digest
  |
  v
GitOps promotion PR
```

## Harbor production recipe

A sensible Harbor project might be:

```text
apps
```

Create a project-scoped robot account for CI with only the permissions needed to push artifacts.

Your CI credentials then conceptually become:

```text
HARBOR_USERNAME=robot$web-ci
HARBOR_PASSWORD=...
```

Authenticate:

```bash
echo "$HARBOR_PASSWORD" \
  | docker login harbor.example.com \
      --username "$HARBOR_USERNAME" \
      --password-stdin
```

Push:

```bash
docker tag web-app:dev \
  harbor.example.com/apps/web:sha-$(git rev-parse --short HEAD)

docker push \
  harbor.example.com/apps/web:sha-$(git rev-parse --short HEAD)
```

Then resolve the pushed digest and promote that digest rather than the tag.

## Registry hardening checklist

For a real Harbor project, consider enabling:

```text
immutable release tags
vulnerability scanning
SBOM generation
retention policy
Cosign or Notation signatures
content-trust enforcement
short-lived / scoped robot credentials
```

A signature stored beside an image is useful evidence.

A policy that verifies signatures before deployment is what turns that evidence into enforcement.

---

# 10. CI Builds the Artifact - It Does Not Deploy It [DEV] [OPS]

Now we automate the application repository.

The CI job will:

```text
checkout source
      |
      v
build image
      |
      v
push human-readable tag
      |
      v
capture immutable digest
      |
      v
sign / attest artifact
      |
      v
open GitOps promotion PR
```

Notice what is missing:

```text
kubectl
cluster kubeconfig
cluster-admin
```

That is the point.

## GitHub + GHCR example

Create:

```bash
mkdir -p .github/workflows
```

Create the build workflow:

```bash
cat > .github/workflows/build.yaml <<'EOF'
name: build

on:
  push:
    branches:
      - main

permissions:
  contents: read
  packages: write
  id-token: write

jobs:
  image:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:sha-${{ github.sha }}

      - name: Record immutable reference
        run: |
          echo "image=ghcr.io/${GITHUB_REPOSITORY}" >> "$GITHUB_STEP_SUMMARY"
          echo "digest=${{ steps.build.outputs.digest }}" >> "$GITHUB_STEP_SUMMARY"
EOF
```

Commit and push:

```bash
git add .github/workflows/build.yaml
git commit -m "build and publish OCI image"
git push
```

## Make sure the cluster can pull the image

There is a useful registry boundary hiding here.

A newly-published GHCR package is private by default.

Your GitHub Actions runner can push it because the workflow has package permission.

Your kind node has no such credential.

If you merge the promotion without dealing with that boundary, you will rediscover:

```text
ImagePullBackOff
```

For the shortest public lab, open the package settings in GitHub and change the container package visibility to **Public**. Public GHCR container packages can be pulled anonymously.

For a private-registry lab, leave it private and create a read credential. For example, using a token that can read the package:

```bash
export GHCR_USER="YOUR_GITHUB_USERNAME"
export GHCR_TOKEN="YOUR_READ_PACKAGES_TOKEN"

kubectl create secret docker-registry ghcr-creds \
  -n web-dev \
  --docker-server=ghcr.io \
  --docker-username="$GHCR_USER" \
  --docker-password="$GHCR_TOKEN"
```

Attach it to the namespace's default ServiceAccount for this lab:

```bash
kubectl patch serviceaccount default \
  -n web-dev \
  --type merge \
  -p '{"imagePullSecrets":[{"name":"ghcr-creds"}]}'
```

Now Pods using that ServiceAccount can present the registry credential when pulling.

For production, do not manually sprinkle long-lived developer tokens through namespaces. Use a deliberate registry-auth pattern such as scoped robot/service credentials, a secret controller, or a node credential provider where appropriate.

This boundary is the same lesson as the kind image sidequest from the main cookbook:

```text
image exists somewhere
       !=
node is authorised and able to obtain it
```

The action output from `docker/build-push-action` includes the registry digest.

That digest is the value we actually want to promote.

## Why not rebuild per environment?

Do not do:

```text
merge
  |
  +--> build dev image
  +--> rebuild staging image
  +--> rebuild prod image
```

Each build can produce different bytes.

Instead:

```text
source commit
     |
     v
ONE image digest
     |
     +--> dev
     |
     +--> staging
     |
     +--> production
```

Promotion means changing **where the already-built artifact is allowed to run**.

It should not mean recompiling it.

---

# 11. Sign and Attest the Artifact [OPS] [PLATFORM]

A digest answers:

> Which bytes?

A signature or provenance attestation helps answer:

> Who or what produced these bytes, and under what build identity?

For GitHub CI, Sigstore/Cosign can use GitHub's OIDC identity so the workflow does not need a long-lived signing key.

Add Cosign:

```yaml
      - name: Install Cosign
        uses: sigstore/cosign-installer@v4

      - name: Sign image
        env:
          IMAGE: ghcr.io/${{ github.repository }}
          DIGEST: ${{ steps.build.outputs.digest }}
        run: |
          cosign sign --yes "${IMAGE}@${DIGEST}"
```

The workflow needs:

```yaml
permissions:
  id-token: write
```

which we already granted.

GitHub also supports artifact provenance attestations using the image digest output.

The exact product choice is less important than the model:

```text
source identity
      |
      v
build system identity
      |
      v
artifact digest
      |
      v
signature / provenance
```

## Verify locally

Install Cosign if needed:

```bash
brew install cosign
```

Then verification takes the general form:

```bash
cosign verify \
  ghcr.io/YOUR_USER/web-app@sha256:... \
  --certificate-identity-regexp='^https://github.com/' \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com
```

For production, make the expected certificate identity specific to the repository and workflow rather than using a broad regular expression.

## Harbor

Harbor can store Cosign signatures as OCI-related artifacts associated with the signed image.

It can also enforce project content-trust policies so unsigned artifacts cannot be pulled.

That makes the chain stronger:

```text
CI signs image
      |
      v
Harbor stores image + signature
      |
      v
Harbor policy rejects unsigned pull
```

Signing without verification is documentation.

Signing plus enforcement is a security control.

---

# 12. Turn the Image Digest into a Promotion Pull Request [DEV] [OPS]

Now we connect the application repository to the GitOps repository.

The application CI should **not** merge directly into production desired state.

It should propose a change.

Conceptually:

```text
new image digest
      |
      v
branch in GitOps repo
      |
      v
pull request
      |
      +-- CI checks
      +-- policy checks
      +-- human review
      |
      v
merge
      |
      v
Argo reconciliation
```

## What should the PR change?

Our development Kustomization currently contains:

```yaml
images:
  - name: example/web
    newName: nginx
    newTag: 1.27-alpine
```

A real promotion should result in something like:

```yaml
images:
  - name: example/web
    newName: ghcr.io/example/web-app
    digest: sha256:0123456789abcdef...
```

That diff is boring.

Boring is good.

The deployment decision becomes obvious in code review.

## Authentication for the GitOps repository

The build repository needs permission to open a PR in the GitOps repository.

For a lab, you can use a fine-grained token stored as:

```text
GITOPS_TOKEN
```

Give it only the target GitOps repository permissions it needs for:

```text
contents: write
pull requests: write
```

For a serious platform, prefer a GitHub App or equivalent workload identity over a developer's personal token.

The identity should represent:

```text
promotion automation
```

not:

```text
Alice's laptop credential
```

## Promotion job

Add this after the image build/sign steps:

```yaml
      - name: Propose development promotion
        env:
          GH_TOKEN: ${{ secrets.GITOPS_TOKEN }}
          GITOPS_REPOSITORY: YOUR_USER/platform-gitops
          IMAGE: ghcr.io/${{ github.repository }}
          DIGEST: ${{ steps.build.outputs.digest }}
          SOURCE_SHA: ${{ github.sha }}
        run: |
          set -euo pipefail

          gh auth setup-git
          gh repo clone "$GITOPS_REPOSITORY" gitops
          cd gitops

          branch="promote/web-${SOURCE_SHA:0:12}"
          git checkout -b "$branch"

          python3 - "$IMAGE" "$DIGEST" <<'PY'
          from pathlib import Path
          import sys

          image = sys.argv[1]
          digest = sys.argv[2]
          p = Path("environments/dev/web/kustomization.yaml")
          text = p.read_text()

          start = text.index("images:\n")
          replacement = f"""images:\n  - name: example/web\n    newName: {image}\n    digest: {digest}\n"""
          text = text[:start] + replacement
          p.write_text(text)
          PY

          git config user.name "web promotion bot"
          git config user.email "web-promotion-bot@users.noreply.github.com"

          git add environments/dev/web/kustomization.yaml
          git commit -m "promote web ${SOURCE_SHA:0:12} to dev"
          git push --set-upstream origin "$branch"

          gh pr create \
            --repo "$GITOPS_REPOSITORY" \
            --base main \
            --head "$branch" \
            --title "Promote web ${SOURCE_SHA:0:12} to dev" \
            --body "Image: ${IMAGE}@${DIGEST}

Source commit: ${SOURCE_SHA}"
```

Replace:

```text
YOUR_USER/platform-gitops
```

with your GitOps repository.

After your next application merge, CI should build an image and open a GitOps PR.

That PR is the deployment proposal.

---

# 13. Review the Promotion Like a Deployment [DEV] [OPS]

Open the generated GitOps PR.

The important diff should effectively be:

```diff
 images:
   - name: example/web
-    newName: nginx
-    newTag: 1.27-alpine
+    newName: ghcr.io/example/web-app
+    digest: sha256:...
```

Before merging, ask:

```text
Did CI pass?
Is the image signed?
Did vulnerability policy pass?
Does the digest correspond to the intended source commit?
Is this environment allowed to consume it?
```

Merge the PR.

Then watch Argo rather than running `kubectl apply`:

```bash
kubectl get application web-dev \
  -n argocd \
  -w
```

Watch Kubernetes underneath it:

```bash
kubectl get deployment,rs,pods \
  -n web-dev \
  -w
```

You should recognise the same rollout machinery from the Kubernetes cookbook.

Git changed.

Argo changed the Deployment desired state.

The Deployment controller changed ReplicaSets and Pods.

The hierarchy is:

```text
Git commit
    |
    v
Argo Application
    |
    v
Deployment.spec.template
    |
    v
ReplicaSet
    |
    v
Pods
```

## Prove which image is running

Ask Kubernetes:

```bash
kubectl get deployment web \
  -n web-dev \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

You should see the digest-pinned image reference.

Now Git history and cluster state can be connected directly.

---

# 14. Why the Pull Request Is Part of the Control Plane [PLATFORM]

It is tempting to think of the PR as bureaucracy around the "real deployment".

In this model, the PR **is part of the deployment control plane**.

The pull request is where we can perform controls before desired state changes:

```text
code review
policy checks
security scan result
change ticket reference
ownership approval
release notes
blast-radius review
```

A production branch might require:

```text
2 reviewers
CODEOWNERS approval
successful policy checks
signed commits
no direct pushes
```

The deployment itself remains automatic after the desired-state decision is accepted.

That separation is important:

```text
human decides what should happen
        |
        v
controller performs it consistently
```

Humans should not need to manually reproduce deployment mechanics on every release.

---

# Part III - Environments Are Promotion Boundaries

# 15. Dev, Staging and Production [DEV] [PLATFORM]

Extend the GitOps repository:

```text
environments/
├── dev/
│   └── web/
├── staging/
│   └── web/
└── prod/
    └── web/
```

The critical idea is:

> Promote the same digest through environments.

Suppose CI built:

```text
ghcr.io/example/web@sha256:abc123
```

Development:

```yaml
digest: sha256:abc123
```

After validation, staging should also use:

```yaml
digest: sha256:abc123
```

Production should eventually use:

```yaml
digest: sha256:abc123
```

Do **not** do:

```text
dev     -> sha256:abc123
staging -> rebuild -> sha256:def456
prod    -> rebuild -> sha256:987xyz
```

You no longer know whether production contains what was tested.

## Promotion PRs

A typical flow becomes:

```text
application merge
      |
      v
CI creates immutable image
      |
      v
PR: digest -> dev
      |
      v
dev verification
      |
      v
PR: same digest -> staging
      |
      v
staging verification
      |
      v
PR: same digest -> production
```

A platform can automate the creation of those PRs while still preserving review gates.

---

# 16. Separate Application Change from Environment Promotion [PLATFORM]

This is one of the most useful organisational consequences of the two-repository model.

Application developers can own:

```text
source
unit tests
Dockerfile
application CI
```

A platform or service team can own:

```text
production rollout policy
replica counts
resources
network exposure
secret references
availability constraints
```

The image digest is the handshake between them.

```text
application team:
"I produced artifact abc123"

platform/environment:
"production is approved to run abc123"
```

This does not require a central platform team to approve every deployment.

Repository ownership and branch rules can express whatever autonomy model the organisation chooses.

The point is that responsibilities become explicit.

---

# 17. AppProjects: Restrict What Argo May Deploy [OPS] [PLATFORM]

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

---

# 18. Argo's Kubernetes Permissions Still Matter [OPS] [PLATFORM]

GitOps does not abolish RBAC.

It moves the actor.

With imperative deployment:

```text
developer / CI identity
        |
        v
Kubernetes RBAC
```

With Argo:

```text
developer
   |
   v
Git permissions
   |
   v
Argo controller identity
   |
   v
Kubernetes RBAC
```

Ask which ServiceAccounts exist:

```bash
kubectl get serviceaccounts \
  -n argocd
```

Inspect the controller identity:

```bash
kubectl get pod \
  -n argocd \
  -l app.kubernetes.io/name=argocd-application-controller \
  -o jsonpath='{.items[0].spec.serviceAccountName}{"\n"}'
```

Then inspect bindings involving Argo:

```bash
kubectl get clusterrolebinding \
  -o yaml \
  | grep -n -C 3 argocd
```

The standard lab installation is deliberately powerful.

That is convenient for one local cluster.

A production platform should answer explicitly:

```text
Which clusters may this Argo instance manage?
Which namespaces?
Which cluster-scoped resources?
Which teams may change its sources and destinations?
```

Never assume "GitOps" means "secure" by default.

It gives us a better control model; we still have to configure that model responsibly.

---

# 19. Secrets Do Not Magically Become Safe Because They Are in Git [DEV] [OPS]

Do not commit this to a normal Git repository:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: database
data:
  password: ...
```

Base64 is encoding, not encryption.

GitOps needs a separate secret strategy.

Common patterns include:

```text
External Secrets Operator
   Git stores a reference
   secret value lives in Vault / cloud secret manager

SOPS
   encrypted secret material lives in Git
   authorised controller decrypts it

Sealed Secrets
   encrypted object lives in Git
   cluster controller decrypts it
```

The core design question is:

> Can Git contain enough desired state to reference the secret without exposing the secret itself?

A production deployment might contain:

```text
Git:
  "web needs database credential named web-db"

secret manager:
  actual credential bytes

controller:
  materialises Kubernetes Secret
```

This is another reconciliation loop.

Modern platforms are often a composition of controllers, each owning one slice of desired state.

---

# Part IV - Progressive Delivery

# 20. Why a Successful Git Sync Is Not the Same as a Safe Release [DEV] [OPS]

Argo CD answers:

> Does the cluster match Git?

That does not necessarily answer:

> Is this new version safe for 100% of users?

A normal Deployment may replace instances gradually, but it does not inherently evaluate business or reliability signals before continuing.

Progressive delivery adds another control loop:

```text
new desired image
      |
      v
small amount of exposure
      |
      v
observe health
      |
  +---+---+
  |       |
good      bad
  |       |
  v       v
more    abort
traffic
```

We will use Argo Rollouts for this lab.

Argo CD and Argo Rollouts solve different problems:

```text
Argo CD
  Git -> Kubernetes desired state

Argo Rollouts
  desired release -> controlled transition between versions
```

They compose well because both are controllers.

---

# 21. Install Argo Rollouts [DEV] [OPS]

Create the namespace:

```bash
kubectl create namespace argo-rollouts
```

Install the controller:

```bash
kubectl apply \
  -n argo-rollouts \
  -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
```

Wait:

```bash
kubectl rollout status \
  deployment/argo-rollouts \
  -n argo-rollouts \
  --timeout=300s
```

On macOS, install the kubectl plugin:

```bash
brew install argoproj/tap/kubectl-argo-rollouts
```

Check:

```bash
kubectl argo rollouts version
```

Find the new APIs:

```bash
kubectl api-resources \
  | grep argoproj
```

You should now see resources including:

```text
Rollout
AnalysisTemplate
AnalysisRun
Experiment
```

Again, a product feature has become Kubernetes API objects plus controllers.

---

# 22. Migrate a Deployment to Rollouts Without Controllers Fighting [DEV] [OPS]

A tempting migration is:

```text
change kind: Deployment
          to Rollout
```

For a throwaway manifest that can be enough.

For a running workload, it hides an important ownership problem.

If a Deployment and Rollout temporarily exist with overlapping selectors, both controllers can be active at the same time.

And if Argo CD keeps enforcing a Deployment replica count while Argo Rollouts is trying to scale that Deployment down during migration, two reconcilers can fight over the same field.

That gives us a better lab.

We will migrate using a Rollout `workloadRef`.

The existing Deployment remains the source of the Pod template.

The Rollout becomes responsible for progressive delivery.

Conceptually:

```text
Git / Kustomize
      |
      v
Deployment Pod template
      |
      | workloadRef
      v
Rollout
      |
      +-- manages progressive ReplicaSets
      |
      +-- scales old Deployment down
```

## First decide who owns `Deployment.spec.replicas`

Our Argo Application currently has self-healing enabled.

Git says the original Deployment has:

```yaml
replicas: 2
```

But during migration, Argo Rollouts needs to scale that Deployment down.

If both controllers insist on owning the same field, we can create a reconciliation tug-of-war:

```text
Git / Argo CD:       replicas must be 2
Argo Rollouts:       replicas must be 0
```

The fix is not to disable reconciliation globally.

The fix is to define field ownership deliberately.

Tell Argo CD to ignore the replica field of this specific Deployment, and to respect that exclusion during sync:

```bash
kubectl patch application web-dev \
  -n argocd \
  --type merge \
  -p '{
    "spec": {
      "ignoreDifferences": [
        {
          "group": "apps",
          "kind": "Deployment",
          "name": "web",
          "namespace": "web-dev",
          "jsonPointers": ["/spec/replicas"]
        }
      ],
      "syncPolicy": {
        "automated": {
          "prune": true,
          "selfHeal": true
        },
        "syncOptions": [
          "CreateNamespace=true",
          "RespectIgnoreDifferences=true"
        ]
      }
    }
  }'
```

Check the relevant part:

```bash
kubectl get application web-dev \
  -n argocd \
  -o yaml \
  | grep -A20 ignoreDifferences
```

This is an important general GitOps pattern:

> If another controller legitimately owns a field, do not make your GitOps controller continuously overwrite it.

HPAs, progressive-delivery controllers, service meshes and other operators can all create this kind of shared ownership.

## Add the Rollout

In the GitOps repository:

```bash
cd ~/gitops-lab/platform-gitops
```

Keep the existing Deployment.

Create a Rollout that references it:

```bash
cat > apps/web/base/rollout.yaml <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: web
spec:
  replicas: 5
  selector:
    matchLabels:
      app: web
  workloadRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
    scaleDown: progressively
  strategy:
    canary:
      steps:
        - setWeight: 20
        - pause: {}
        - setWeight: 50
        - pause:
            duration: 30s
        - setWeight: 100
EOF
```

Add it to the base Kustomization:

```bash
python3 - <<'PY2'
from pathlib import Path
p = Path("apps/web/base/kustomization.yaml")
s = p.read_text()
if "  - rollout.yaml\n" not in s:
    s = s.replace("resources:\n", "resources:\n  - rollout.yaml\n")
p.write_text(s)
PY2
```

Do **not** remove the Deployment.

The Rollout is using its Pod template through `workloadRef`.

Render the desired state:

```bash
kubectl kustomize environments/dev/web
```

You should see both:

```text
Deployment/web
Rollout/web
```

That is intentional during this migration pattern.

Commit and push:

```bash
git add .
git commit -m "migrate web delivery to Argo Rollouts"
git push
```

Watch the two controllers:

```bash
kubectl get deployment,rollout,rs,pods \
  -n web-dev \
  -w
```

Inspect the Rollout:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev
```

The Rollout should establish its own stable ReplicaSet while progressively scaling down the old Deployment-managed workload.

Inspect the original Deployment:

```bash
kubectl get deployment web \
  -n web-dev
```

Its replica count can now be changed by the Rollouts controller without Argo CD immediately restoring the Git value.

## Where does the image live now?

Because we used `workloadRef`, the Pod template still lives on the Deployment:

```bash
kubectl get deployment web \
  -n web-dev \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Our existing Kustomize image override therefore continues to work exactly where it did before.

When a promotion PR changes the Deployment Pod template image, Argo Rollouts observes the referenced workload change and performs the canary transition.

This gives us a clean division of ownership:

```text
Git / Argo CD
  owns Deployment Pod template
  owns Rollout policy

Argo Rollouts
  owns progressive ReplicaSets
  owns migration scaling

Kubernetes
  owns Pod execution and status
```

The migration itself has taught us something broader than Argo Rollouts:

> Multiple controllers can cooperate safely only when we understand which fields and resources each controller owns.

---

# 23. Ship v2 as a Canary [DEV] [OPS]

Change the application page:

```bash
cd ~/gitops-lab/web-app

cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <h1>GitOps demo</h1>
    <p>version: v2</p>
  </body>
</html>
EOF
```

Commit and push:

```bash
git add index.html
git commit -m "release v2"
git push
```

Your CI should:

```text
build v2
push it
capture digest
open GitOps PR
```

Merge the promotion PR.

Now watch Argo Rollouts:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

The rollout should reach:

```text
20% canary
PAUSED
```

With five replicas and no dedicated traffic router, the weight is represented approximately by replica count.

Inspect Pods:

```bash
kubectl get pods \
  -n web-dev \
  -l app=web \
  -o wide
```

You should see old and new ReplicaSets coexisting.

This is the same mechanism you learned for Deployments, but now the transition has explicit programmable steps.

## Send traffic

Port-forward the Service:

```bash
kubectl port-forward \
  -n web-dev \
  service/web \
  8082:80
```

From another terminal, make several requests:

```bash
for i in $(seq 1 20); do
  curl -s http://127.0.0.1:8082 \
    | grep version
  sleep 0.2
done
```

Depending on connection reuse and Service load balancing you should observe both versions over repeated independent requests.

For exact 5%, 10%, header-based, or mirrored traffic, we need a traffic-management layer rather than relying only on replica ratios.

We will return to that later.

---

# 24. Promote the Canary [DEV] [OPS]

The rollout is paused because Git describes **the release policy** as well as the image.

A human can inspect it:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev
```

Promote it:

```bash
kubectl argo rollouts promote web \
  -n web-dev
```

Watch:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

It should move through the remaining steps until v2 becomes stable.

Notice the separation of decisions:

```text
GitOps PR:
"this is the desired release"

Rollout policy:
"this is how we expose that release"

promotion:
"the observed canary looks acceptable"
```

Those are three different concerns.

---

# 25. Ship a Bad Release and Abort It [DEV] [OPS]

Now make v3 deliberately obvious and undesirable.

```bash
cd ~/gitops-lab/web-app

cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <h1>GitOps demo</h1>
    <p>version: v3-BAD</p>
  </body>
</html>
EOF

git add index.html
git commit -m "ship intentionally bad v3"
git push
```

Let CI create the promotion PR and merge it.

Watch until the canary pauses:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

Suppose testing or metrics say the version is bad.

Abort the rollout immediately:

```bash
kubectl argo rollouts abort web \
  -n web-dev
```

Inspect:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev
```

The stable ReplicaSet should be restored to serve the workload.

But we have a subtle problem.

Git still says:

```text
v3 digest is desired
```

Argo Rollouts says:

```text
v3 rollout is aborted
stable v2 is serving
```

The emergency action protected users.

It did **not** change the source of truth.

This distinction is fundamental.

---

# 26. Operational Rollback vs Git Rollback [OPS] [PLATFORM]

We need two different concepts:

```text
ABORT
  stop exposing a bad release now

REVERT
  change desired state back to the known-good artifact
```

The abort is an operational safety action.

The Git revert makes the desired state honest again.

## Revert the promotion

In the GitOps repository, identify the merge commit that promoted v3:

```bash
cd ~/gitops-lab/platform-gitops

git log --oneline --decorate -10
```

Create a revert branch:

```bash
git checkout main
git pull

git checkout -b rollback/web-v3

git revert <PROMOTION_MERGE_COMMIT>
```

Push it:

```bash
git push -u origin rollback/web-v3
```

Open a pull request:

```bash
gh pr create \
  --title "Rollback web v3" \
  --body "Restore the previous known-good image digest after canary abort."
```

Merge it.

Argo CD sees Git return to the previous digest.

Argo Rollouts now has desired state that agrees with the stable version.

The system converges again.

## Why not `kubectl set image` to v2?

Because that would create another hidden live mutation:

```text
cluster says v2
Git says v3
```

Self-healing GitOps would eventually try to restore v3.

Emergency commands are fine when the system is burning.

But the source of truth must subsequently be corrected.

---

# 27. Automate the Decision with Analysis [OPS] [PLATFORM]

Manual promotion is useful while learning.

A mature delivery system usually evaluates signals automatically.

Examples:

```text
HTTP error rate
latency
saturation
queue depth
business conversion
synthetic checks
smoke-test webhook
```

Argo Rollouts represents this using:

```text
AnalysisTemplate
      |
      v
AnalysisRun
      |
      v
measurement
      |
  +---+---+
  |       |
success failure
  |       |
  v       v
continue abort
```

## A tiny runnable analysis gate

For the lab, create a static JSON health endpoint.

This is deliberately simpler than Prometheus so we can see the mechanism first.

Create:

```bash
cat > /tmp/analysis-gate.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: analysis-gate
  namespace: web-dev
data:
  result.json: |
    {"ok": true}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analysis-gate
  namespace: web-dev
spec:
  replicas: 1
  selector:
    matchLabels:
      app: analysis-gate
  template:
    metadata:
      labels:
        app: analysis-gate
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
          volumeMounts:
            - name: data
              mountPath: /usr/share/nginx/html
      volumes:
        - name: data
          configMap:
            name: analysis-gate
---
apiVersion: v1
kind: Service
metadata:
  name: analysis-gate
  namespace: web-dev
spec:
  selector:
    app: analysis-gate
  ports:
    - port: 80
      targetPort: 80
EOF

kubectl apply -f /tmp/analysis-gate.yaml
```

Test it:

```bash
kubectl run curl-test \
  -n web-dev \
  --rm -i --restart=Never \
  --image=curlimages/curl \
  -- \
  curl -s http://analysis-gate/result.json
```

Expected:

```json
{"ok": true}
```

Create an AnalysisTemplate in the GitOps repository:

```bash
cd ~/gitops-lab/platform-gitops

cat > apps/web/base/analysis.yaml <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: web-health
spec:
  metrics:
    - name: release-gate
      successCondition: result == true
      failureLimit: 1
      provider:
        web:
          url: http://analysis-gate.web-dev.svc.cluster.local/result.json
          jsonPath: "{$.ok}"
EOF
```

Add it to Kustomize:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path("apps/web/base/kustomization.yaml")
s = p.read_text()
if "  - analysis.yaml\n" not in s:
    s = s.replace("resources:\n", "resources:\n  - analysis.yaml\n")
p.write_text(s)
PY
```

Now change the Rollout steps so analysis occurs after the 20% canary:

```yaml
  strategy:
    canary:
      steps:
        - setWeight: 20
        - pause:
            duration: 10s
        - analysis:
            templates:
              - templateName: web-health
        - setWeight: 50
        - pause:
            duration: 20s
        - setWeight: 100
```

Commit and push the GitOps change.

Then trigger another image promotion.

Inspect generated AnalysisRuns:

```bash
kubectl get analysisrun \
  -n web-dev
```

Describe one:

```bash
kubectl describe analysisrun \
  -n web-dev \
  <analysis-run-name>
```

## Make the gate fail

Change the ConfigMap:

```bash
kubectl patch configmap analysis-gate \
  -n web-dev \
  --type merge \
  -p '{"data":{"result.json":"{\"ok\": false}\n"}}'
```

Wait for the projected ConfigMap volume to update, or restart the gate Pod:

```bash
kubectl rollout restart deployment/analysis-gate \
  -n web-dev
```

Trigger another release.

The AnalysisRun should fail and the Rollout should abort rather than progressing.

## Production translation

The static gate is only teaching the API.

A real platform would normally query a measurement system such as Prometheus:

```text
success rate >= 99.5%
p95 latency < 300 ms
error rate < 1%
```

The concept remains identical.

---

# 28. Canary Replica Ratios vs Real Traffic Shaping [OPS] [PLATFORM]

Our basic canary uses replica counts.

With five replicas:

```text
1 canary + 4 stable ~= 20%
```

That is useful but crude.

It cannot express concepts such as:

```text
1% traffic to canary
only users with header X
mirror requests without using canary responses
90/10 traffic while keeping equal replica counts
```

For that, Argo Rollouts integrates with traffic-management systems.

This is where our Gateway API / Cilium work connects directly.

Conceptually:

```text
Rollout desired weight
       |
       v
Argo Rollouts
       |
       v
Gateway API route weights
       |
       v
Cilium
       |
       v
real network traffic
```

Modern Argo Rollouts can integrate with Gateway API through its traffic-router plugin system.

That allows the progressive-delivery controller to update Gateway API routing state rather than merely scaling stable/canary replica counts.

For learners following the Cilium Gateway API companion, this is the natural next exercise after mastering the basic Rollout.

The important architectural connection is:

```text
Git
 |
 v
Argo CD
 |
 v
Rollout
 |
 v
Argo Rollouts
 |
 +--> ReplicaSets
 |
 +--> Gateway API route weight
          |
          v
        Cilium
```

Each controller owns a different concern.

## Another controller-ownership trap

A traffic router introduces the same field-ownership issue we saw during Deployment-to-Rollout migration.

If Argo Rollouts dynamically changes route weights while Argo CD insists that the weights must always equal the static values committed in Git, the controllers can report permanent drift or overwrite one another.

The usual GitOps pattern is to keep the route object in Git while explicitly ignoring the fields that the progressive-delivery controller is expected to mutate.

Conceptually:

```text
Git owns:
  route identity
  hostnames
  backends
  rollout policy

Rollouts owns during release:
  dynamic traffic weights
```

This is not weakening GitOps.

It is defining ownership precisely enough for multiple reconcilers to cooperate.

---

# 29. Blue-Green: Build the Replacement Before You Switch Traffic [DEV] [OPS]

Canary is not the only progressive-delivery strategy.

A canary asks:

> Can we expose a small amount of real traffic to the new version and increase it gradually?

Blue-green asks a different question:

> Can we build the entire replacement, test it separately, and switch production traffic only when we are happy?

The mental model is:

```text
                         +--------------------+
                         | stable ReplicaSet  |
                         |        v3          |
                         +---------+----------+
                                   ^
                                   |
                         active Service
                                   |
                              production


                         +--------------------+
                         | preview ReplicaSet |
                         |        v4          |
                         +---------+----------+
                                   ^
                                   |
                         preview Service
                                   |
                           tests / humans
```

Both versions exist.

But only one receives production traffic.

When we promote:

```text
before
------

web Service ----------> v3
web-preview Service --> v4


promotion
---------

web Service ----------> v4
web-preview Service --> v4

                         v3 remains briefly
                         available for rollback
```

This gives blue-green a very useful property:

```text
new version is deployed
        !=
new version is serving production traffic
```

That distinction is worth experiencing directly.

## Canary vs blue-green

The two strategies solve slightly different release problems.

```text
RollingUpdate
  replace instances gradually
  simplest operational model

Canary
  expose some real production traffic
  measure behaviour
  increase exposure gradually

Blue-green
  build a complete replacement
  validate it away from production
  switch traffic when ready
```

Blue-green is often easier to reason about because there is a hard traffic boundary between the active and preview versions.

It does have a cost.

For at least part of the release we may run two versions simultaneously:

```text
active capacity
+
preview capacity
```

For an expensive workload that may matter.

Argo Rollouts lets us reduce preview capacity with `previewReplicaCount`, but the new version must be scaled to the full desired replica count before it becomes active.

## When would you choose each strategy?

Blue-green is attractive when:

```text
we can validate a version before production traffic
cutover should happen quickly
old and new versions cannot safely share live traffic
rollback speed matters
extra temporary capacity is acceptable
```

Canary is attractive when:

```text
real-user behaviour is part of validation
we have useful production metrics
we want gradual blast-radius expansion
our application tolerates multiple versions serving simultaneously
we have a traffic router for precise percentages
```

Neither is universally better.

A platform can support both.

The release should choose the strategy that matches the application's risk model.

---

# 30. Convert Our Rollout from Canary to Blue-Green [DEV] [OPS] [PLATFORM]

We already have:

```text
Git
  |
  v
Argo CD
  |
  v
Rollout/web
  |
  v
ReplicaSets
```

We are going to keep that delivery chain.

We will change only the progressive-delivery strategy.

The blue-green controller needs two Services:

```text
web
  active production traffic

web-preview
  pre-production validation traffic
```

Argo Rollouts will dynamically add a ReplicaSet hash to those Service selectors so that each Service points at exactly the intended version.

That creates an important ownership question.

## Who owns the Service selector?

Our Service currently lives in Git:

```yaml
spec:
  selector:
    app: web
```

For blue-green, Argo Rollouts will turn the live selector into something conceptually like:

```yaml
spec:
  selector:
    app: web
    rollouts-pod-template-hash: 6d997f5c6
```

That hash changes as releases change.

If Argo CD insists that the selector must always exactly match the static Git version, we create another reconciliation fight:

```text
Argo Rollouts:
  selector must point at ReplicaSet v4

Argo CD:
  selector must equal Git exactly
```

We have already seen this class of problem with `Deployment.spec.replicas`.

The solution is the same:

> Define field ownership deliberately.

Git still owns:

```text
Service identity
ports
protocol
application labels
```

Argo Rollouts owns during blue-green delivery:

```text
the live Service selector used to choose the active/preview ReplicaSet
```

## Give Rollouts ownership of the dynamic selectors

First inspect our current Argo CD exception:

```bash
kubectl get application web-dev \
  -n argocd \
  -o yaml \
  | grep -A30 ignoreDifferences
```

We already ignore the Deployment replica field used during `workloadRef` migration.

Replace the ignore list with all three controller-owned fields:

```bash
kubectl patch application web-dev \
  -n argocd \
  --type merge \
  -p '{
    "spec": {
      "ignoreDifferences": [
        {
          "group": "apps",
          "kind": "Deployment",
          "name": "web",
          "namespace": "web-dev",
          "jsonPointers": ["/spec/replicas"]
        },
        {
          "group": "",
          "kind": "Service",
          "name": "web",
          "namespace": "web-dev",
          "jsonPointers": ["/spec/selector"]
        },
        {
          "group": "",
          "kind": "Service",
          "name": "web-preview",
          "namespace": "web-dev",
          "jsonPointers": ["/spec/selector"]
        }
      ],
      "syncPolicy": {
        "automated": {
          "prune": true,
          "selfHeal": true
        },
        "syncOptions": [
          "CreateNamespace=true",
          "RespectIgnoreDifferences=true"
        ]
      }
    }
  }'
```

Verify:

```bash
kubectl get application web-dev \
  -n argocd \
  -o yaml \
  | grep -A45 ignoreDifferences
```

The important lesson is not the exact Argo syntax.

It is this:

```text
multiple controllers
        |
        v
must have a coherent ownership model
```

## Restore our analysis gate

The previous chapter deliberately made the analysis endpoint fail.

Set it back to healthy before the next experiment:

```bash
kubectl patch configmap analysis-gate \
  -n web-dev \
  --type merge \
  -p '{"data":{"result.json":"{\"ok\": true}\n"}}'
```

Restart the tiny gate workload so there is no ambiguity about what it serves:

```bash
kubectl rollout restart deployment/analysis-gate \
  -n web-dev
```

Check it:

```bash
kubectl run analysis-check \
  -n web-dev \
  --rm -i --restart=Never \
  --image=curlimages/curl \
  -- \
  curl -s http://analysis-gate/result.json
```

Expected:

```json
{"ok": true}
```

## Add the preview Service to Git

Move to the GitOps repository:

```bash
cd ~/gitops-lab/platform-gitops

git checkout main
git pull

git checkout -b platform/blue-green
```

Create the preview Service:

```bash
cat > apps/web/base/web-preview.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web-preview
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
EOF
```

Add it to the base Kustomization:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path("apps/web/base/kustomization.yaml")
s = p.read_text()
if "  - web-preview.yaml\n" not in s:
    s = s.replace("resources:\n", "resources:\n  - web-preview.yaml\n")
p.write_text(s)
PY
```

## Change the Rollout strategy

Replace the canary policy with blue-green:

```bash
cat > apps/web/base/rollout.yaml <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: web
spec:
  replicas: 5
  revisionHistoryLimit: 5
  rollbackWindow:
    revisions: 3
  selector:
    matchLabels:
      app: web
  workloadRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
    scaleDown: progressively
  strategy:
    blueGreen:
      activeService: web
      previewService: web-preview
      previewReplicaCount: 2
      autoPromotionEnabled: false
      scaleDownDelaySeconds: 60
      prePromotionAnalysis:
        templates:
          - templateName: web-health
EOF
```

There are several important controls here.

### `activeService`

```yaml
activeService: web
```

This is the production Service.

Argo Rollouts controls which ReplicaSet it selects.

### `previewService`

```yaml
previewService: web-preview
```

This gives us an endpoint for the new version **before** promotion.

### `previewReplicaCount`

```yaml
previewReplicaCount: 2
```

Our Rollout wants five replicas in steady state.

During preview we only need two copies to validate the version.

This saves some temporary capacity:

```text
active:   5 replicas
preview:  2 replicas
```

Before promotion, Rollouts scales the preview version to the required active size.

### `autoPromotionEnabled`

```yaml
autoPromotionEnabled: false
```

Even after the preview is healthy, production does not switch automatically.

The rollout pauses until we explicitly promote it.

### `prePromotionAnalysis`

```yaml
prePromotionAnalysis:
  templates:
    - templateName: web-health
```

Our existing AnalysisTemplate runs **before the active Service switches**.

That gives us:

```text
new version ready
      |
      v
analysis
      |
  +---+---+
  |       |
pass     fail
  |       |
  v       v
pause   abort
  |
manual promotion
  |
active Service switches
```

### `scaleDownDelaySeconds`

```yaml
scaleDownDelaySeconds: 60
```

After promotion, Rollouts keeps the old active ReplicaSet around briefly.

There are two reasons this is useful:

```text
network rule propagation
+
rapid rollback window
```

The default is already conservative, but a minute makes the behaviour easy to observe in our lab.

### `rollbackWindow`

```yaml
rollbackWindow:
  revisions: 3
```

Recent revisions can be fast-tracked if Git moves back to them.

That is particularly useful in a GitOps system:

```text
bad release
   |
Git revert
   |
old digest becomes desired again
   |
Rollouts recognises recent revision
   |
fast rollback
```

## Render before committing

Do not use Git as a YAML syntax checker.

Render the overlay locally:

```bash
kubectl kustomize environments/dev/web \
  > /tmp/web-blue-green.yaml
```

Check that it contains:

```bash
grep -nE 'kind: Rollout|kind: Service|name: web-preview|blueGreen:' \
  /tmp/web-blue-green.yaml
```

Ask the API server to validate it without changing the cluster:

```bash
kubectl apply \
  --dry-run=server \
  -f /tmp/web-blue-green.yaml \
  >/dev/null
```

Now commit the platform change:

```bash
git add apps/web/base

git commit -m "add blue-green delivery strategy"

git push -u origin platform/blue-green
```

Create a pull request:

```bash
gh pr create \
  --title "Use blue-green delivery for web" \
  --body "Add a preview Service and move web from canary steps to an Argo Rollouts blue-green strategy."
```

Review it.

Then merge it:

```bash
gh pr merge \
  --merge \
  --delete-branch
```

Return to main:

```bash
git checkout main
git pull
```

Watch Argo CD reconcile:

```bash
kubectl get application web-dev \
  -n argocd \
  -w
```

In another terminal inspect the Rollout:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev
```

And the Services:

```bash
kubectl get service web web-preview \
  -n web-dev
```

At steady state, both Services may initially point at the current stable ReplicaSet.

The interesting behaviour appears on the next release.

---

# 31. Ship a Blue-Green Release: Preview First, Production Later [DEV] [OPS]

Now we will ship a version whose lifecycle is deliberately visible.

The application change still begins in the **application repository**.

That is important.

We do not edit the GitOps repository by hand to invent a release.

The application CI builds an immutable artifact and proposes its digest for promotion.

## Create the next application version

Move to the application repository:

```bash
cd ~/gitops-lab/web-app

git checkout main
git pull
```

Change the page:

```bash
cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <h1>GitOps demo</h1>
    <p>version: blue-green-v4</p>
  </body>
</html>
EOF
```

Commit and push:

```bash
git add index.html

git commit -m "release blue-green v4"

git push
```

The application CI should now perform the chain we built earlier:

```text
commit
  |
  v
build image
  |
  v
push image
  |
  v
resolve immutable digest
  |
  v
open promotion PR against GitOps repository
```

Inspect the promotion PR:

```bash
gh pr list \
  --repo "${GITHUB_USER}/${GITOPS_REPO_NAME}"
```

Open the diff and verify that the important change is an immutable digest rather than `latest`:

```text
old digest
    ↓
new digest
```

Merge the promotion PR.

## Watch the preview environment appear

Watch the Rollout:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

The new ReplicaSet should be created and become the preview version.

Because we set:

```yaml
previewReplicaCount: 2
```

we expect approximately:

```text
stable ReplicaSet:   5 Pods
preview ReplicaSet:  2 Pods
```

Inspect them:

```bash
kubectl get rs,pods \
  -n web-dev \
  -l app=web
```

Now look at the Service selectors:

```bash
kubectl get service web web-preview \
  -n web-dev \
  -o custom-columns='SERVICE:.metadata.name,HASH:.spec.selector.rollouts-pod-template-hash,APP:.spec.selector.app'
```

You should see different hashes while the new version is awaiting promotion:

```text
SERVICE       HASH         APP
web           <old-hash>   web
web-preview   <new-hash>   web
```

This is the blue-green boundary made concrete.

Argo Rollouts has changed routing without changing either Service's identity.

## Talk to production

Port-forward the active Service:

```bash
kubectl port-forward \
  -n web-dev \
  service/web \
  8082:80
```

From another terminal:

```bash
curl -s http://127.0.0.1:8082 \
  | grep version
```

You should still see the **currently active** version.

The new release exists, but production has not moved.

## Talk directly to preview

Open another terminal and port-forward the preview Service:

```bash
kubectl port-forward \
  -n web-dev \
  service/web-preview \
  8083:80
```

Now query it:

```bash
curl -s http://127.0.0.1:8083 \
  | grep version
```

Expected:

```text
version: blue-green-v4
```

We have now personally observed:

```text
active Service  ---> old version
preview Service ---> new version
```

That is the core of blue-green delivery.

## Validate the preview like a real platform would

A human can perform a smoke test:

```bash
curl -fsS http://127.0.0.1:8083 >/dev/null \
  && echo "preview responds successfully"
```

You could also run:

```text
integration tests
synthetic transactions
schema compatibility checks
browser automation
security tests
performance smoke tests
```

Our Rollout has already run `web-health` as a pre-promotion AnalysisRun.

Inspect it:

```bash
kubectl get analysisrun \
  -n web-dev \
  --sort-by=.metadata.creationTimestamp
```

Describe the newest one:

```bash
LATEST_ANALYSIS=$(kubectl get analysisrun \
  -n web-dev \
  --sort-by=.metadata.creationTimestamp \
  -o jsonpath='{.items[-1:].metadata.name}')

kubectl describe analysisrun \
  -n web-dev \
  "$LATEST_ANALYSIS"
```

At this point we know:

```text
image built successfully
        |
image was pulled successfully
        |
Pods became Ready
        |
preview endpoint works
        |
automated gate passed
        |
production still serves old version
```

This is a much stronger decision point than:

```text
CI job went green -> deploy everything
```

## Promote the preview

When satisfied, promote it:

```bash
kubectl argo rollouts promote web \
  -n web-dev
```

Watch:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

During promotion, Rollouts will ensure the new ReplicaSet reaches the full desired size before switching production traffic.

Inspect the Services again:

```bash
kubectl get service web web-preview \
  -n web-dev \
  -o custom-columns='SERVICE:.metadata.name,HASH:.spec.selector.rollouts-pod-template-hash'
```

Both should now point at the new ReplicaSet hash.

Re-run the production request:

```bash
curl -s http://127.0.0.1:8082 \
  | grep version
```

Now production should say:

```text
version: blue-green-v4
```

The important operation was not replacing the Service.

The Service stayed stable:

```text
web.web-dev.svc.cluster.local
```

Argo Rollouts changed **which ReplicaSet that stable identity selected**.

## Observe the old version before it disappears

Immediately after promotion:

```bash
kubectl get rs \
  -n web-dev \
  -l app=web
```

The old active ReplicaSet should remain scaled for roughly our configured delay:

```yaml
scaleDownDelaySeconds: 60
```

Watch it:

```bash
kubectl get rs \
  -n web-dev \
  -l app=web \
  -w
```

Eventually the old ReplicaSet scales down.

This delay is intentionally different from keeping old ReplicaSet metadata around.

Kubernetes may retain the old ReplicaSet object for revision history even after its replica count reaches zero.

The distinction is:

```text
revision retained
        !=
old application still consuming full compute
```

---

# 32. Break Blue-Green Safely: Fail Before Production Sees It [DEV] [OPS]

Now let's make blue-green earn its keep.

We will deliberately create a release that:

```text
builds successfully
runs successfully
becomes Ready
```

but fails our release gate.

That is more interesting than a broken container image because Kubernetes itself considers the workload healthy enough to run.

Our **delivery policy** rejects it.

## Make the gate fail first

Set our analysis endpoint to false:

```bash
kubectl patch configmap analysis-gate \
  -n web-dev \
  --type merge \
  -p '{"data":{"result.json":"{\"ok\": false}\n"}}'
```

Restart the tiny gate:

```bash
kubectl rollout restart deployment/analysis-gate \
  -n web-dev
```

Verify:

```bash
kubectl run analysis-check \
  -n web-dev \
  --rm -i --restart=Never \
  --image=curlimages/curl \
  -- \
  curl -s http://analysis-gate/result.json
```

Expected:

```json
{"ok": false}
```

## Build another perfectly runnable release

Move to the application repository:

```bash
cd ~/gitops-lab/web-app
```

Create v5:

```bash
cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <h1>GitOps demo</h1>
    <p>version: blue-green-v5-REJECT-ME</p>
  </body>
</html>
EOF
```

Commit and push:

```bash
git add index.html

git commit -m "release blue-green v5 for failed gate lab"

git push
```

Again, CI should build and push the image, resolve the digest, and open a GitOps promotion PR.

Merge that PR.

## Watch the new version appear only behind preview

Watch:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

The preview ReplicaSet should start normally.

Inspect Services:

```bash
kubectl get service web web-preview \
  -n web-dev \
  -o custom-columns='SERVICE:.metadata.name,HASH:.spec.selector.rollouts-pod-template-hash'
```

And inspect the analysis:

```bash
kubectl get analysisrun \
  -n web-dev \
  --sort-by=.metadata.creationTimestamp
```

The new pre-promotion analysis should fail.

Inspect it:

```bash
LATEST_ANALYSIS=$(kubectl get analysisrun \
  -n web-dev \
  --sort-by=.metadata.creationTimestamp \
  -o jsonpath='{.items[-1:].metadata.name}')

kubectl describe analysisrun \
  -n web-dev \
  "$LATEST_ANALYSIS"
```

The Rollout should enter an aborted/degraded state rather than switching the active Service.

## Prove production never moved

Query the active Service:

```bash
curl -s http://127.0.0.1:8082 \
  | grep version
```

It should still be the known-good version:

```text
version: blue-green-v4
```

Query preview:

```bash
curl -s http://127.0.0.1:8083 \
  | grep version
```

Depending on the precise aborted state and cleanup timing, the preview Service may still expose the rejected ReplicaSet long enough to debug it.

The critical fact is:

```text
active Service did not switch
```

Production never needed a rollback because production never received the rejected release.

That is blue-green's nicest failure mode.

## But Git still asks for v5

We have the same desired-state issue we saw during the canary abort.

Operational state says:

```text
v4 is serving safely
v5 was rejected
```

Git still says:

```text
v5 digest is desired
```

So the Rollout is correctly unhealthy/degraded.

It has not forgotten what we asked for.

Again:

```text
protecting production
        !=
fixing desired state
```

## Revert the promotion through Git

Move to the GitOps repository:

```bash
cd ~/gitops-lab/platform-gitops

git checkout main
git pull
```

Find the v5 promotion commit:

```bash
git log --oneline --decorate -10
```

Create a rollback branch:

```bash
git checkout -b rollback/blue-green-v5
```

Revert the promotion merge:

```bash
git revert <V5_PROMOTION_MERGE_COMMIT>
```

Push it:

```bash
git push -u origin rollback/blue-green-v5
```

Open the rollback PR:

```bash
gh pr create \
  --title "Rollback rejected blue-green v5" \
  --body "Restore the last known-good digest after pre-promotion analysis rejected v5."
```

Review and merge it.

Then:

```bash
git checkout main
git pull
```

Watch Argo CD and Argo Rollouts converge:

```bash
kubectl get application web-dev \
  -n argocd \
  -w
```

and:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

Because we configured:

```yaml
rollbackWindow:
  revisions: 3
```

returning Git to a recent ReplicaSet can be fast-tracked instead of needlessly replaying the entire progressive-delivery process.

## Restore the analysis gate

Leave the lab in a healthy state:

```bash
kubectl patch configmap analysis-gate \
  -n web-dev \
  --type merge \
  -p '{"data":{"result.json":"{\"ok\": true}\n"}}'
```

Restart it:

```bash
kubectl rollout restart deployment/analysis-gate \
  -n web-dev
```

---

# 33. Rolling, Canary and Blue-Green Are Different Risk Controls [OPS] [PLATFORM]

We now have enough experience to compare the strategies based on behaviour rather than vocabulary.

| Strategy | What happens to the new version? | Production exposure | Extra infrastructure | Best fit |
|---|---|---|---|---|
| RollingUpdate | Pods gradually replace old Pods | increases as replacement proceeds | usually low | simple stateless workloads |
| Canary | old and new versions coexist | gradually increased | moderate | measurable production risk |
| Blue-green | full/partial preview is created separately | none until cutover | potentially high | strong pre-production validation and fast cutover |

The easiest way to remember the difference is:

```text
RollingUpdate:
  replace gradually

Canary:
  expose gradually

Blue-green:
  validate separately, then switch
```

## The same GitOps promotion model supports all three

Notice what did **not** change between our canary and blue-green exercises:

```text
application developer
      |
      v
application PR
      |
      v
CI build
      |
      v
immutable image digest
      |
      v
promotion PR
      |
      v
Git desired state
      |
      v
Argo CD
```

Only the release controller's strategy changed after Argo CD delivered the desired artifact to Kubernetes.

That separation is powerful.

A platform can standardise:

```text
build
artifact identity
security evidence
promotion
Git review
cluster reconciliation
```

while allowing workloads to choose an appropriate rollout policy.

## Rollback means different things at different moments

Before blue-green promotion:

```text
new version rejected
production never moved
```

There is no traffic rollback to perform.

We only need to repair desired state in Git.

Immediately after blue-green promotion:

```text
new version active
old ReplicaSet may still be scaled up
```

Operational rollback can be extremely fast.

After old capacity has been scaled down:

```text
Git revert
   |
   v
old digest becomes desired
   |
   v
Rollouts restores the previous revision
```

With a rollback window, recent revisions can be fast-tracked.

For canary:

```text
abort
  |
  v
stable ReplicaSet regains exposure
```

but Git must still be corrected if it describes the rejected image.

The recurring lesson is:

> Operational safety actions and source-of-truth changes are related, but they are not the same operation.

## The platform-engineering view

At this point our delivery system contains several reconcilers:

```text
Git
 |
 v
Argo CD
 |
 +------------------------------+
 |                              |
 v                              v
Rollout policy               Services
 |                              ^
 v                              |
Argo Rollouts ------------------+
 |
 v
ReplicaSets
 |
 v
Pods
```

For canary with a traffic router we add another loop:

```text
Argo Rollouts
      |
      v
Gateway API route weights
      |
      v
Cilium
```

For blue-green, Rollouts controls active/preview Service selectors instead.

This is why platform engineering is fundamentally about more than installing controllers.

You need to know:

```text
which controller owns which resource
which controller owns which field
what the source of truth is
which mutations are temporary operational state
which mutations must go back through Git
```

That is the difference between a platform composed of controllers and a pile of controllers fighting each other.

---

# Part V - Platform Engineering

# 34. CI Should Have Registry and Git Permissions - Not Cluster Admin [PLATFORM]

Our final developer pipeline has approximately these permissions:

```text
application repository
  read source

OCI registry
  push application artifact

GitOps repository
  create branch
  create pull request
```

It does **not** need:

```text
Kubernetes API credential
production kubeconfig
cluster-admin
SSH access to nodes
```

This dramatically reduces what a compromised CI runner can do directly.

That does not mean CI compromise is harmless.

An attacker able to build and promote an image may still be able to propose malicious software.

The defence becomes layered:

```text
branch protection
review
artifact signing
vulnerability policy
admission policy
Argo project constraints
Kubernetes RBAC
runtime isolation
```

Good architecture reduces authority at each step rather than trusting one enormous credential.

---

# 35. The GitOps Repository Is Production Infrastructure [PLATFORM]

Treat the GitOps repository accordingly.

Do not think of it as a random directory of YAML.

It contains production authority.

Useful controls include:

```text
branch protection
CODEOWNERS
required pull-request reviews
status checks
signed commits where appropriate
restricted automation credentials
audit logs
protected environment directories
```

For example:

```text
/environments/dev/**
  application team may approve

/environments/prod/**
  service owner + platform policy approval

/platform/**
  platform team only
```

Git permissions are now part of the infrastructure permission model.

Earlier we asked:

> Can Alice delete Nodes through Kubernetes RBAC?

GitOps introduces another question:

> Can Alice merge desired state that causes Argo to create or delete powerful resources?

Indirect privilege is still privilege.

---

# 36. Repository Layout Is an API Design Problem [PLATFORM]

There is no universally correct GitOps repository shape.

The structure communicates ownership and promotion boundaries.

One reasonable layout is:

```text
platform-gitops/
├── apps/
│   └── web/
│       └── base/
├── environments/
│   ├── dev/
│   │   └── web/
│   ├── staging/
│   │   └── web/
│   └── prod/
│       └── web/
└── platform/
    ├── argocd/
    ├── rollouts/
    └── gateway/
```

Another platform may use one repository per environment or business unit.

The useful questions are:

```text
Who may approve this path?
What blast radius does changing this directory have?
Can one repository compromise every cluster?
How is an artifact promoted?
How do we audit the change?
```

Repository topology is not merely aesthetic.

It is part of your security and operating model.

---

# 37. ApplicationSet: When One Application Becomes Hundreds [OPS] [PLATFORM]

Creating one Argo `Application` by hand is fine.

Creating 500 nearly-identical Application objects manually is not.

Argo CD provides `ApplicationSet` to generate Applications from data.

Conceptually:

```text
list of clusters / directories / tenants
            |
            v
       ApplicationSet
            |
            v
    many Applications
            |
            v
       many reconciliations
```

A simplified list example:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: web-environments
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - env: dev
            namespace: web-dev
          - env: staging
            namespace: web-staging
  template:
    metadata:
      name: 'web-{{env}}'
    spec:
      project: web-team
      source:
        repoURL: https://github.com/example/platform-gitops.git
        targetRevision: main
        path: 'environments/{{env}}/web'
      destination:
        server: https://kubernetes.default.svc
        namespace: '{{namespace}}'
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

Do not use ApplicationSet merely because it exists.

Use it when the repetition itself is data-driven.

Typical platform examples include:

```text
one app per cluster
one app per tenant
one app per region
one environment directory per service
```

This is the GitOps version of moving from hand-created Pods to controllers.

---

# 38. App of Apps, ApplicationSet and Platform Bootstrapping [DEEP DIVE]

Eventually you may want GitOps to manage the platform components that enable GitOps.

That sounds circular because it is.

A bootstrap process often looks like:

```text
create cluster
    |
    v
install minimal Argo CD
    |
    v
point Argo at platform bootstrap repository
    |
    v
Argo installs / manages
  - policies
  - ingress / Gateway API
  - observability
  - operators
  - team Applications
```

Once bootstrapped, most ongoing platform state can flow through Git.

You still need an answer for:

```text
Who creates the cluster?
Who installs the first Argo instance?
Who provides its Git credentials?
Who upgrades Argo itself?
```

GitOps moves the bootstrap boundary.

It does not eliminate it.

This is where tools such as Cluster API, hosted control planes, Terraform/OpenTofu, MAAS/NiCO, vCluster, or Kamaji may sit beneath the application platform.

A useful full-stack model is:

```text
infrastructure desired state
        |
        v
clusters / nodes / networks
        |
        v
GitOps bootstrap
        |
        v
platform services
        |
        v
application GitOps
        |
        v
workloads
```

---

# 39. Supply-Chain Policy: Build Evidence Must Reach Deployment Policy [PLATFORM]

We built and signed an artifact.

That is only half the story.

A mature platform connects build evidence to deployment policy.

For example:

```text
CI produces:
  image digest
  signature
  provenance
  SBOM
  vulnerability result

promotion policy requires:
  trusted builder identity
  no forbidden vulnerabilities
  approved source repository
  immutable digest

admission policy verifies:
  image is allowed to start
```

This closes a gap that Git review alone cannot.

A perfectly reviewed Git commit could still point to:

```text
unsigned malicious image
```

if nothing verifies the artifact.

Likewise, a perfectly signed artifact can still be accidentally promoted to the wrong environment if Git permissions are too broad.

The controls reinforce one another.

---

# 40. Harbor as a Platform Registry [PLATFORM]

Harbor becomes particularly useful when an organisation wants the registry itself to enforce platform rules.

A production pattern might be:

```text
Harbor project: payments

CI robot:
  push
  read

runtime identity:
  pull only

platform admin:
  configure retention
  immutability
  scanning
  trust policy
```

Useful policy decisions:

## Make release tags immutable

Allow:

```text
sha-abc123
v1.4.2
```

but prevent those tags from being overwritten once published.

This does not replace digest pinning.

It makes human-readable references less surprising.

## Generate SBOMs

Harbor can integrate SBOM generation with its scanner.

The SBOM gives visibility into the packages inside an artifact.

## Enforce signatures

Harbor can associate Cosign/Notation signatures with OCI artifacts and can enforce content trust on a project.

The desired path becomes:

```text
unsigned image
   X
cannot be consumed

signed trusted image
   |
   v
runtime may pull it
```

## Use robot accounts

Automations should not log in using a platform administrator's personal username and password.

Create separate identities for:

```text
CI publisher
replication
scanner
runtime pull
```

with the smallest permissions each needs.

This mirrors Kubernetes ServiceAccounts and RBAC.

Machine identity should be explicit.

---

# 41. Observability for the Delivery System [OPS] [PLATFORM]

The deployment system is production software too.

Monitor it.

Useful questions include:

```text
Is Argo able to read Git?
Are Applications OutOfSync?
Are Applications Degraded?
How long do syncs take?
Are Rollouts paused or aborted?
Are AnalysisRuns failing?
Can nodes pull images?
Did registry scanning fail?
Are promotion PRs stuck?
```

A useful event chain for one release is:

```text
source commit
    |
    v
CI run
    |
    v
image digest
    |
    v
promotion PR
    |
    v
Git merge commit
    |
    v
Argo sync revision
    |
    v
Rollout revision
    |
    v
ReplicaSet
    |
    v
Pods
```

Preserving those identifiers makes incident response dramatically easier.

Good platform metadata might include:

```text
source git SHA
image digest
GitOps commit SHA
service name
environment
owner
release timestamp
```

---

# 42. Failure Drills [OPS]

A delivery system is not understood until you have watched it fail.

Run these deliberately in the lab.

## Drill 1 - Git changes to an invalid image digest

Set the GitOps image to a nonexistent digest.

Observe:

```text
Argo: desired state accepted
Kubernetes: ImagePullBackOff
Application health: degraded / progressing
```

Question:

> Which controller is functioning correctly, and where is reconciliation blocked?

## Drill 2 - Delete a managed Pod

```bash
kubectl delete pod \
  -n web-dev \
  -l app=web
```

Observe the Rollout/ReplicaSet restore it without any Git change.

## Drill 3 - Scale live state manually

Change replica count with `kubectl`.

Observe Argo self-heal return it to Git.

## Drill 4 - Remove a manifest from Git

Observe prune behaviour.

## Drill 5 - Break repository access

Temporarily point the Application at a repository/path Argo cannot read.

Observe:

```bash
kubectl describe application web-dev \
  -n argocd
```

## Drill 6 - Abort a canary but do not revert Git

Observe the tension between:

```text
stable runtime state
```

and:

```text
new desired Git state
```

Then repair it properly with a revert.

## Drill 7 - Stop Argo CD

Scale the application controller down in the lab.

Observe that running workloads continue.

GitOps is a reconciliation mechanism, not the runtime dataplane.

Restore the controller and observe reconciliation resume.

---

# 43. Anti-Patterns That Look Reasonable [DEV] [OPS] [PLATFORM]

## CI runs `kubectl apply`

It works, but pushes cluster credentials into the CI system and makes Git less authoritative.

Prefer:

```text
CI -> artifact + PR
Argo -> cluster
```

## Deploy `:latest`

You cannot reliably answer which bytes Git intended.

Prefer an immutable digest.

## Rebuild the image for production

You are no longer deploying what staging tested.

Promote the same digest.

## Let automation merge its own production PR immediately

Then the PR is theatre.

If no review or policy decision is required, be explicit about that rather than pretending there is a gate.

## Give every Argo Application the `default` project forever

The default project is deliberately broad.

Create explicit source and destination boundaries.

## Put plaintext Secrets in Git because "GitOps"

GitOps requires a secret-management pattern, not wishful thinking.

## Sign images but never verify signatures

You collected evidence but do not enforce it.

## Abort the rollout but leave Git pointing at the failed version

You fixed runtime exposure but not desired state.

Abort first if needed; revert Git next.

## Let developers mutate production manually "just this once"

Sometimes incidents require imperative changes.

The important rule is:

> Reconcile the source of truth immediately afterwards.

Otherwise emergency drift becomes permanent architecture.

---

# 44. A Production Delivery Reference Architecture [PLATFORM]

Putting the pieces together:

```text
                         DEVELOPER
                             |
                             | pull request
                             v
                    APPLICATION REPOSITORY
                             |
                    review / tests / merge
                             |
                             v
                            CI
                  +----------+----------+
                  |                     |
               build                 test/scan
                  |                     |
                  +----------+----------+
                             |
                             v
                       OCI REGISTRY
                     Harbor / GHCR
                             |
                  +----------+----------+
                  |                     |
              image digest          signature
              SBOM                  provenance
                  |                     |
                  +----------+----------+
                             |
                             v
                     PROMOTION AUTOMATION
                             |
                             | opens PR
                             v
                       GITOPS REPOSITORY
                             |
                   review / policy / merge
                             |
                             v
                          ARGO CD
                             |
                             v
                     KUBERNETES API
                             |
                  +----------+----------+
                  |                     |
             Argo Rollouts         other controllers
                  |
        +---------+---------+
        |                   |
   stable ReplicaSet    canary ReplicaSet
        |                   |
        +---------+---------+
                  |
        Gateway API / Cilium
                  |
                  v
                USERS
```

Underneath this application-delivery plane may be another platform layer:

```text
cluster lifecycle
      |
      +-- managed cloud Kubernetes
      +-- Cluster API
      +-- Kamaji
      +-- vCluster
      +-- metal provisioning
      +-- networking / storage
```

GitOps is not the entire platform.

It is one extremely useful reconciliation boundary inside the platform.

---

# 45. From Kubernetes Learner to Platform Engineer [DEV] [OPS] [PLATFORM]

The progression through these cookbooks now looks approximately like this:

```text
LEVEL 1 - Kubernetes user

Pod
Deployment
Service
ConfigMap
Secret
PVC
probes

        |
        v

LEVEL 2 - Kubernetes developer

rollouts
resources
scheduling
RBAC
Kustomize
Helm
Gateway API

        |
        v

LEVEL 3 - Kubernetes internals

spec / status
controllers
CRDs
ownerReferences
finalizers
custom Go reconciler

        |
        v

LEVEL 4 - delivery engineer

OCI images
immutable digests
CI
GitOps
Argo CD
promotion PRs
progressive delivery
rollback

        |
        v

LEVEL 5 - platform engineer

AppProjects
multi-tenancy
hosted control planes
Gateway API / Cilium
registry policy
artifact trust
secret systems
fleet management
ApplicationSets
observability
policy

        |
        v

LEVEL 6 - platform designer

Who owns desired state?
Where are trust boundaries?
Which controller owns each resource?
How does software move between environments?
How is privilege constrained?
How do we prove what is running?
How does the platform fail safely?
```

The tools will change.

Those questions age much more slowly.

---

# 46. Production Checklist [PLATFORM]

Before calling a GitOps delivery platform production-ready, be able to answer all of these.

## Artifact

```text
[ ] Is every release associated with an immutable digest?
[ ] Is the same digest promoted through environments?
[ ] Are release tags immutable where practical?
[ ] Are artifacts vulnerability scanned?
[ ] Is an SBOM available?
[ ] Are artifacts signed / attested?
[ ] Is signature/provenance verification enforced somewhere?
```

## CI

```text
[ ] Does CI avoid general Kubernetes credentials?
[ ] Are registry credentials scoped?
[ ] Is GitOps write access scoped to the required repository/path?
[ ] Is automation represented by a machine identity, not a person's token?
[ ] Can the build identity be audited?
```

## Git

```text
[ ] Are production branches protected?
[ ] Are CODEOWNERS / reviewers appropriate?
[ ] Is direct push disabled where required?
[ ] Can every production digest be traced to a reviewed change?
[ ] Is rollback performed through source-of-truth changes?
```

## Argo CD

```text
[ ] Are AppProjects explicit rather than relying on default?
[ ] Are source repositories restricted?
[ ] Are destination namespaces/clusters restricted?
[ ] Is Argo's own Kubernetes RBAC understood?
[ ] Is access to the argocd namespace tightly controlled?
[ ] Are prune and self-heal policies deliberate?
[ ] Are Argo upgrades and backups planned?
```

## Progressive delivery

```text
[ ] Is rollout strategy appropriate for the service?
[ ] Are canary signals meaningful?
[ ] Can a release be aborted quickly?
[ ] Is there a documented Git rollback path?
[ ] Are automated analyses observable and auditable?
[ ] Is traffic shaping coarse replica ratio or real routed traffic by design?
```

## Secrets

```text
[ ] Are plaintext production secrets kept out of ordinary Git history?
[ ] Is secret rotation supported?
[ ] Can workloads access only the secrets they need?
```

## Operations

```text
[ ] Can you identify source commit -> image digest -> GitOps commit -> running Pods?
[ ] Are reconciliation failures alerted?
[ ] Are OutOfSync and Degraded applications visible?
[ ] Are stuck/aborted Rollouts visible?
[ ] Have failure drills actually been run?
```

If several answers are "we assume so", keep building.

---

# 47. Cleanup [DEV]

Remove the Argo-managed application first:

```bash
kubectl delete application web-dev \
  -n argocd
```

Depending on finalizer/prune configuration, inspect whether its managed resources remain:

```bash
kubectl get all \
  -n web-dev
```

Delete the lab namespace if required:

```bash
kubectl delete namespace web-dev
```

Remove Argo Rollouts:

```bash
kubectl delete namespace argo-rollouts
```

Remove Argo CD:

```bash
kubectl delete namespace argocd
```

The CRDs are cluster-scoped and may remain after deleting namespaces.

Inspect:

```bash
kubectl get crd \
  | grep argoproj
```

For a disposable kind lab, the cleanest full reset is often simply deleting and recreating the cluster.

Do not blindly use that advice on a cluster containing anything you care about.

---

# Appendix A - The Whole Reconciliation Stack

A useful final mental model:

```text
SOURCE CODE
   |
   | developer changes application behaviour
   v
APPLICATION GIT
   |
   | CI reconciles source into an artifact
   v
OCI IMAGE DIGEST
   |
   | promotion automation proposes desired deployment
   v
GITOPS GIT
   |
   | Argo CD reconciles Git into Kubernetes resources
   v
ROLLOUT / DEPLOYMENT SPEC
   |
   | workload controller reconciles replicas
   v
REPLICASETS / PODS
   |
   | kubelet reconciles Pod specs on nodes
   v
CONTAINERS
```

With progressive delivery:

```text
ROLLOUT
   |
   +--> stable ReplicaSet
   |
   +--> canary ReplicaSet
   |
   +--> AnalysisRun
   |
   +--> traffic routing policy
```

With Gateway API:

```text
HTTPRoute desired weight
        |
        v
Gateway controller / Cilium
        |
        v
network dataplane
```

With secrets:

```text
ExternalSecret
      |
      v
secret controller
      |
      v
Kubernetes Secret
```

With a multi-tenant platform:

```text
tenant Git
   |
   v
Argo permissions
   |
   v
tenant API / namespace boundary
   |
   v
worker isolation
```

A modern Kubernetes platform is not one giant program.

It is a set of reconciliation loops with deliberately-designed ownership and trust boundaries.

---

# Appendix B - Tag vs Digest Cheat Sheet

Use tags for humans:

```text
web:v1.4.2
web:sha-4f91d20
```

Use digests when exact bytes matter:

```text
web@sha256:abc123...
```

A useful CI output is both:

```text
Tag:
  ghcr.io/acme/web:sha-4f91d20

Digest:
  sha256:abc123...
```

The GitOps repository promotes:

```text
ghcr.io/acme/web@sha256:abc123...
```

The PR body can show the friendly tag/source commit for humans.

---

# Appendix C - When to Use Argo CD Image Updater, Renovate or Similar

In this handbook, application CI opens the promotion PR itself.

That is not the only valid automation model.

Another controller or bot can watch registries and propose Git changes.

Examples include:

```text
Argo CD Image Updater
Renovate
Flux image automation
custom release automation
```

The important requirement is not which bot edits Git.

The requirement is that the final desired-state decision remains explicit and auditable.

A useful distinction is:

```text
DISCOVERY
"a new artifact exists"

PROMOTION
"this environment should now run it"
```

Do not accidentally turn discovery into uncontrolled production promotion unless that is explicitly the policy you want.

For example:

```text
automatically discover every new dev image
    -> probably fine

automatically deploy every new image to prod
    -> much stronger decision
```

---

# Appendix D - Further Reading

Prefer primary documentation because these projects evolve quickly.

## Argo CD

- Installation: https://argo-cd.readthedocs.io/en/latest/operator-manual/installation/
- Declarative setup and AppProjects: https://argo-cd.readthedocs.io/en/latest/operator-manual/declarative-setup/
- Sync options: https://argo-cd.readthedocs.io/en/latest/user-guide/sync-options/
- Sync phases and waves: https://argo-cd.readthedocs.io/en/latest/user-guide/sync-waves/

## Argo Rollouts

- Getting started: https://argo-rollouts.readthedocs.io/en/stable/getting-started/
- Canary strategy: https://argo-rollouts.readthedocs.io/en/stable/features/canary/
- Blue-green strategy: https://argo-rollouts.readthedocs.io/en/stable/features/bluegreen/
- Rollback windows: https://argo-rollouts.readthedocs.io/en/stable/features/rollback/
- Analysis: https://argo-rollouts.readthedocs.io/en/stable/features/analysis/
- Traffic management: https://argo-rollouts.readthedocs.io/en/stable/features/traffic-management/

## Kubernetes

- Kustomize: https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/
- Images and digests: https://kubernetes.io/docs/concepts/containers/images/

## Harbor

- Robot accounts: https://goharbor.io/docs/edge/administration/robot-accounts/
- Image signing: https://goharbor.io/docs/main/working-with-projects/working-with-images/sign-images/
- Content trust: https://goharbor.io/docs/edge/working-with-projects/project-configuration/implementing-content-trust/
- SBOM generation: https://goharbor.io/docs/edge/administration/sbom-integration/

## Sigstore

- Cosign quickstart: https://docs.sigstore.dev/quickstart/quickstart-cosign/
- Verification: https://docs.sigstore.dev/cosign/verifying/verify/

---

# Final Takeaway

Bad CI/CD often gives one automation system enormous authority:

```text
source
  |
  v
CI
  |
  | build
  | mutate production
  | own cluster credentials
  v
cluster
```

A better delivery platform separates concerns:

```text
source
  |
  v
CI
  |
  | produces immutable evidence
  v
artifact
  |
  v
promotion PR
  |
  | changes reviewed desired state
  v
Git
  |
  v
Argo CD
  |
  | reconciles cluster intent
  v
Argo Rollouts
  |
  | controls exposure
  v
runtime
```

At each boundary we can ask:

```text
What is the desired state?
Who may change it?
Which controller reconciles it?
What identity does that controller use?
How do we observe failure?
How do we return to a known-good state?
```

If you can answer those questions, you are no longer merely deploying to Kubernetes.

You are designing a platform.
