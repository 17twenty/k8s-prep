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
