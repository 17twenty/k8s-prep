## CI runs `kubectl apply`

It works, but pushes cluster credentials into the CI system and makes Git less authoritative.

Prefer:

```text
CI -> artifact + PR
Argo -> cluster
```

## Deploy `:latest`

You cannot reliably answer which bytes Git intended.

Prefer an immutable digest.

## Rebuild the image for production

You are no longer deploying what staging tested.

Promote the same digest.

## Let automation merge its own production PR immediately

Then the PR is theatre.

If no review or policy decision is required, be explicit about that rather than pretending there is a gate.

## Give every Argo Application the `default` project forever

The default project is deliberately broad.

Create explicit source and destination boundaries.

## Put plaintext Secrets in Git because "GitOps"

GitOps requires a secret-management pattern, not wishful thinking.

## Sign images but never verify signatures

You collected evidence but do not enforce it.

## Abort the rollout but leave Git pointing at the failed version

You fixed runtime exposure but not desired state.

Abort first if needed; revert Git next.

## Let developers mutate production manually "just this once"

Sometimes incidents require imperative changes.

The important rule is:

> Reconcile the source of truth immediately afterwards.

Otherwise emergency drift becomes permanent architecture.
