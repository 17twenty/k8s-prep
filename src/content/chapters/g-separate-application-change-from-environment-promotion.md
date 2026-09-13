This is one of the most useful organisational consequences of the two-repository model.

Application developers can own:

```text
source
unit tests
Dockerfile
application CI
```

A platform or service team can own:

```text
production rollout policy
replica counts
resources
network exposure
secret references
availability constraints
```

The image digest is the handshake between them.

```text
application team:
"I produced artifact abc123"

platform/environment:
"production is approved to run abc123"
```

This does not require a central platform team to approve every deployment.

Repository ownership and branch rules can express whatever autonomy model the organisation chooses.

The point is that responsibilities become explicit.
