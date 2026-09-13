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
