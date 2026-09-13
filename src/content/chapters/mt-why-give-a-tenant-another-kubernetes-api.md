Suppose Alice needs broad Kubernetes freedom.

Inside a normal shared cluster, this would be dangerous:

```text
Alice
  |
  v
cluster-admin
  |
  v
shared cluster
```

`cluster-admin` is intentionally enormous.

A platform provider often wants something different:

```text
Alice
  |
  v
Alice's Kubernetes API
  |
  | cluster-admin is okay HERE
  v
Alice's tenant cluster


provider
  |
  v
provider Kubernetes API
  |
  | Alice does NOT get these credentials
  v
provider infrastructure
```

This changes the question from:

> How carefully can I restrict Alice inside my cluster?

into:

> Why should Alice be an administrator of my cluster at all?

That distinction is central to virtual clusters, hosted control planes and many managed Kubernetes systems.
