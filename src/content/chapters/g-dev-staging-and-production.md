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
