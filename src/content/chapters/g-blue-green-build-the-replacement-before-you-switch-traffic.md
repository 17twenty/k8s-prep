Canary is not the only progressive-delivery strategy.

A canary asks:

> Can we expose a small amount of real traffic to the new version and increase it gradually?

Blue-green asks a different question:

> Can we build the entire replacement, test it separately, and switch production traffic only when we are happy?

The mental model is:

```text
                         +--------------------+
                         | stable ReplicaSet  |
                         |        v3          |
                         +---------+----------+
                                   ^
                                   |
                         active Service
                                   |
                              production


                         +--------------------+
                         | preview ReplicaSet |
                         |        v4          |
                         +---------+----------+
                                   ^
                                   |
                         preview Service
                                   |
                           tests / humans
```

Both versions exist.

But only one receives production traffic.

When we promote:

```text
before
------

web Service ----------> v3
web-preview Service --> v4


promotion
---------

web Service ----------> v4
web-preview Service --> v4

                         v3 remains briefly
                         available for rollback
```

This gives blue-green a very useful property:

```text
new version is deployed
        !=
new version is serving production traffic
```

That distinction is worth experiencing directly.

## Canary vs blue-green

The two strategies solve slightly different release problems.

```text
RollingUpdate
  replace instances gradually
  simplest operational model

Canary
  expose some real production traffic
  measure behaviour
  increase exposure gradually

Blue-green
  build a complete replacement
  validate it away from production
  switch traffic when ready
```

Blue-green is often easier to reason about because there is a hard traffic boundary between the active and preview versions.

It does have a cost.

For at least part of the release we may run two versions simultaneously:

```text
active capacity
+
preview capacity
```

For an expensive workload that may matter.

Argo Rollouts lets us reduce preview capacity with `previewReplicaCount`, but the new version must be scaled to the full desired replica count before it becomes active.

## When would you choose each strategy?

Blue-green is attractive when:

```text
we can validate a version before production traffic
cutover should happen quickly
old and new versions cannot safely share live traffic
rollback speed matters
extra temporary capacity is acceptable
```

Canary is attractive when:

```text
real-user behaviour is part of validation
we have useful production metrics
we want gradual blast-radius expansion
our application tolerates multiple versions serving simultaneously
we have a traffic router for precise percentages
```

Neither is universally better.

A platform can support both.

The release should choose the strategy that matches the application's risk model.
