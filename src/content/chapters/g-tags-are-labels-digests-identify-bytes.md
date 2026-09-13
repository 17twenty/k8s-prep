A container tag is a convenient name:

```text
web:v1
web:sha-2f41c2b
web:stable
```

A registry may move a tag so that it points at a different artifact.

A digest identifies content:

```text
sha256:9d47...
```

Kubernetes can deploy either:

```yaml
image: registry.example.com/team/web:v1
```

or:

```yaml
image: registry.example.com/team/web@sha256:9d47...
```

For a promotion system, the second form is much stronger.

The Git commit then says:

> Run these exact image bytes.

not:

> Ask the registry what `v1` means today.

## Recommended pattern

Build one artifact.

Attach useful tags for humans:

```text
sha-<git commit>
v1.4.3
release-2026-09-13
```

But promote the immutable digest:

```text
registry.example.com/team/web@sha256:...
```

That gives us both:

```text
human discoverability
       +
immutable deployment identity
```

Avoid production deployments using:

```text
:latest
```

because it intentionally hides which artifact is meant.
