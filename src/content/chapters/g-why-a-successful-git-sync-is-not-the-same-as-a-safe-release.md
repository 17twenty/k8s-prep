Argo CD answers:

> Does the cluster match Git?

That does not necessarily answer:

> Is this new version safe for 100% of users?

A normal Deployment may replace instances gradually, but it does not inherently evaluate business or reliability signals before continuing.

Progressive delivery adds another control loop:

```text
new desired image
      |
      v
small amount of exposure
      |
      v
observe health
      |
  +---+---+
  |       |
good      bad
  |       |
  v       v
more    abort
traffic
```

We will use Argo Rollouts for this lab.

Argo CD and Argo Rollouts solve different problems:

```text
Argo CD
  Git -> Kubernetes desired state

Argo Rollouts
  desired release -> controlled transition between versions
```

They compose well because both are controllers.
