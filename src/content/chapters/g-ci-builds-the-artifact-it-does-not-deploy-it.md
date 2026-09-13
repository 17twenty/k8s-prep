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
