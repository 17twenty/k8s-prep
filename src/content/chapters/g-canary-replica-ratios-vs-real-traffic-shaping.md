Our basic canary uses replica counts.

With five replicas:

```text
1 canary + 4 stable ~= 20%
```

That is useful but crude.

It cannot express concepts such as:

```text
1% traffic to canary
only users with header X
mirror requests without using canary responses
90/10 traffic while keeping equal replica counts
```

For that, Argo Rollouts integrates with traffic-management systems.

This is where our Gateway API / Cilium work connects directly.

Conceptually:

```text
Rollout desired weight
       |
       v
Argo Rollouts
       |
       v
Gateway API route weights
       |
       v
Cilium
       |
       v
real network traffic
```

Modern Argo Rollouts can integrate with Gateway API through its traffic-router plugin system.

That allows the progressive-delivery controller to update Gateway API routing state rather than merely scaling stable/canary replica counts.

For learners following the Cilium Gateway API companion, this is the natural next exercise after mastering the basic Rollout.

The important architectural connection is:

```text
Git
 |
 v
Argo CD
 |
 v
Rollout
 |
 v
Argo Rollouts
 |
 +--> ReplicaSets
 |
 +--> Gateway API route weight
          |
          v
        Cilium
```

Each controller owns a different concern.

## Another controller-ownership trap

A traffic router introduces the same field-ownership issue we saw during Deployment-to-Rollout migration.

If Argo Rollouts dynamically changes route weights while Argo CD insists that the weights must always equal the static values committed in Git, the controllers can report permanent drift or overwrite one another.

The usual GitOps pattern is to keep the route object in Git while explicitly ignoring the fields that the progressive-delivery controller is expected to mutate.

Conceptually:

```text
Git owns:
  route identity
  hostnames
  backends
  rollout policy

Rollouts owns during release:
  dynamic traffic weights
```

This is not weakening GitOps.

It is defining ownership precisely enough for multiple reconcilers to cooperate.
