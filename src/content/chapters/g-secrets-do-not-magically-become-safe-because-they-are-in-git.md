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
