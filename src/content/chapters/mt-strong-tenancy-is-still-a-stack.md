Even a separate tenant kube-apiserver does not solve every problem.

For an untrusted external tenant, a design may need something closer to:

```text
Tenant identity
    |
    v
Tenant API server
    |
    +-- tenant-local RBAC
    +-- admission / policy
    |
    v
Dedicated or strongly isolated compute
    |
    +-- runtime security
    +-- device isolation
    |
    v
Tenant network boundary
    |
    +-- NetworkPolicy
    +-- VPC / VLAN / routing policy
    |
    v
Tenant storage boundary
    |
    +-- CSI / volume policy
    +-- encryption / credentials
    |
    v
Provider management plane
    |
    X tenant credentials do not cross this boundary
```

Do not collapse those controls into one mental bucket.

```text
RBAC
  != NetworkPolicy
  != scheduler placement
  != node isolation
  != VM isolation
  != storage isolation
  != host IAM
```
