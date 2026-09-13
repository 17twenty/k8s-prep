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
