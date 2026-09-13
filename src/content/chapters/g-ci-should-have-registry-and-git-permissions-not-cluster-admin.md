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
