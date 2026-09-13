Eventually you may want GitOps to manage the platform components that enable GitOps.

That sounds circular because it is.

A bootstrap process often looks like:

```text
create cluster
    |
    v
install minimal Argo CD
    |
    v
point Argo at platform bootstrap repository
    |
    v
Argo installs / manages
  - policies
  - ingress / Gateway API
  - observability
  - operators
  - team Applications
```

Once bootstrapped, most ongoing platform state can flow through Git.

You still need an answer for:

```text
Who creates the cluster?
Who installs the first Argo instance?
Who provides its Git credentials?
Who upgrades Argo itself?
```

GitOps moves the bootstrap boundary.

It does not eliminate it.

This is where tools such as Cluster API, hosted control planes, Terraform/OpenTofu, MAAS/NiCO, vCluster, or Kamaji may sit beneath the application platform.

A useful full-stack model is:

```text
infrastructure desired state
        |
        v
clusters / nodes / networks
        |
        v
GitOps bootstrap
        |
        v
platform services
        |
        v
application GitOps
        |
        v
workloads
```
