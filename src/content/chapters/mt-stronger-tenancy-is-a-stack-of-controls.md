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
    +-- VPC / VLAN / routing policy as appropriate
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

The exact implementation varies, but the model is portable.

The mistake to avoid is assuming one control implies all the others.

For example:

```text
RBAC
  != NetworkPolicy
  != node isolation
  != VM isolation
  != storage isolation
  != host IAM
```
