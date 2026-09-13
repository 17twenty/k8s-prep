GitOps does not require a particular OCI registry.

For the easiest hosted lab, GitHub Container Registry gives us CI and registry authentication from the same GitHub account.

A platform often uses something such as Harbor because it adds features useful to operators:

```text
projects
robot accounts
retention
immutability
vulnerability scanning
SBOM generation
signatures / content trust
replication
```

The delivery architecture remains identical:

```text
CI build
  |
  v
OCI registry
  |
  v
immutable digest
  |
  v
GitOps promotion PR
```

## Harbor production recipe

A sensible Harbor project might be:

```text
apps
```

Create a project-scoped robot account for CI with only the permissions needed to push artifacts.

Your CI credentials then conceptually become:

```text
HARBOR_USERNAME=robot$web-ci
HARBOR_PASSWORD=...
```

Authenticate:

```bash
echo "$HARBOR_PASSWORD" \
  | docker login harbor.example.com \
      --username "$HARBOR_USERNAME" \
      --password-stdin
```

Push:

```bash
docker tag web-app:dev \
  harbor.example.com/apps/web:sha-$(git rev-parse --short HEAD)

docker push \
  harbor.example.com/apps/web:sha-$(git rev-parse --short HEAD)
```

Then resolve the pushed digest and promote that digest rather than the tag.

## Registry hardening checklist

For a real Harbor project, consider enabling:

```text
immutable release tags
vulnerability scanning
SBOM generation
retention policy
Cosign or Notation signatures
content-trust enforcement
short-lived / scoped robot credentials
```

A signature stored beside an image is useful evidence.

A policy that verifies signatures before deployment is what turns that evidence into enforcement.
