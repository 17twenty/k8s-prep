We now have enough experience to compare the strategies based on behaviour rather than vocabulary.

| Strategy | What happens to the new version? | Production exposure | Extra infrastructure | Best fit |
|---|---|---|---|---|
| RollingUpdate | Pods gradually replace old Pods | increases as replacement proceeds | usually low | simple stateless workloads |
| Canary | old and new versions coexist | gradually increased | moderate | measurable production risk |
| Blue-green | full/partial preview is created separately | none until cutover | potentially high | strong pre-production validation and fast cutover |

The easiest way to remember the difference is:

```text
RollingUpdate:
  replace gradually

Canary:
  expose gradually

Blue-green:
  validate separately, then switch
```

## The same GitOps promotion model supports all three

Notice what did **not** change between our canary and blue-green exercises:

```text
application developer
      |
      v
application PR
      |
      v
CI build
      |
      v
immutable image digest
      |
      v
promotion PR
      |
      v
Git desired state
      |
      v
Argo CD
```

Only the release controller's strategy changed after Argo CD delivered the desired artifact to Kubernetes.

That separation is powerful.

A platform can standardise:

```text
build
artifact identity
security evidence
promotion
Git review
cluster reconciliation
```

while allowing workloads to choose an appropriate rollout policy.

## Rollback means different things at different moments

Before blue-green promotion:

```text
new version rejected
production never moved
```

There is no traffic rollback to perform.

We only need to repair desired state in Git.

Immediately after blue-green promotion:

```text
new version active
old ReplicaSet may still be scaled up
```

Operational rollback can be extremely fast.

After old capacity has been scaled down:

```text
Git revert
   |
   v
old digest becomes desired
   |
   v
Rollouts restores the previous revision
```

With a rollback window, recent revisions can be fast-tracked.

For canary:

```text
abort
  |
  v
stable ReplicaSet regains exposure
```

but Git must still be corrected if it describes the rejected image.

The recurring lesson is:

> Operational safety actions and source-of-truth changes are related, but they are not the same operation.

## The platform-engineering view

At this point our delivery system contains several reconcilers:

```text
Git
 |
 v
Argo CD
 |
 +------------------------------+
 |                              |
 v                              v
Rollout policy               Services
 |                              ^
 v                              |
Argo Rollouts ------------------+
 |
 v
ReplicaSets
 |
 v
Pods
```

For canary with a traffic router we add another loop:

```text
Argo Rollouts
      |
      v
Gateway API route weights
      |
      v
Cilium
```

For blue-green, Rollouts controls active/preview Service selectors instead.

This is why platform engineering is fundamentally about more than installing controllers.

You need to know:

```text
which controller owns which resource
which controller owns which field
what the source of truth is
which mutations are temporary operational state
which mutations must go back through Git
```

That is the difference between a platform composed of controllers and a pile of controllers fighting each other.
