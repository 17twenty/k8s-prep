The rollout is paused because Git describes **the release policy** as well as the image.

A human can inspect it:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev
```

Promote it:

```bash
kubectl argo rollouts promote web \
  -n web-dev
```

Watch:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

It should move through the remaining steps until v2 becomes stable.

Notice the separation of decisions:

```text
GitOps PR:
"this is the desired release"

Rollout policy:
"this is how we expose that release"

promotion:
"the observed canary looks acceptable"
```

Those are three different concerns.
