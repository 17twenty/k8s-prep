Suppose Alice needs enough freedom to behave like a cluster administrator.

On one shared cluster, granting:

```text
cluster-admin
```

means Alice can administer the shared cluster itself.

That is usually not what a platform provider wants.

A different architecture is:

```text
Alice
  |
  v
tenant A kube-apiserver
  |
  | Alice may be cluster-admin here
  v
tenant A Kubernetes view


Bob
  |
  v
tenant B kube-apiserver
  |
  | Bob may be cluster-admin here
  v
tenant B Kubernetes view
```

The provider then owns the infrastructure underneath both tenant control planes.

The tenant can have broad authority **inside their cluster** without receiving authority over the provider's management cluster.

That is the architectural territory occupied by hosted control planes, virtual clusters and managed Kubernetes systems.
