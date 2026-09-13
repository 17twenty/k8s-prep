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
