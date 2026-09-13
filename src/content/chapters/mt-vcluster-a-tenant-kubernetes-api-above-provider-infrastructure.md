Current vCluster architecture gives each tenant cluster its own control plane, including its own Kubernetes API server, controller manager, datastore and syncer.

Conceptually:

```text
                 provider control-plane cluster

                    Kubernetes API
                         |
           +-------------+-------------+
           |                           |
           v                           v
   tenant A control plane       tenant B control plane
   - API server                 - API server
   - controller manager         - controller manager
   - datastore                  - datastore
   - syncer                     - syncer
           |                           |
           v                           v
         Alice                         Bob
```

Alice talks to the tenant A API server.

She does not need credentials for the provider's control-plane cluster API.

Inside tenant A, Alice can have tenant-local RBAC such as:

```text
cluster-admin
```

without that automatically becoming provider-cluster `cluster-admin`.

## 4.1 Shared-node mode

With shared nodes, tenant workloads are projected onto the underlying control-plane cluster and scheduled onto its node pool.

A simplified path is:

```text
Alice
  |
  v
tenant A API
  |
  v
syncer
  |
  v
provider cluster namespace
  |
  v
provider scheduler
  |
  v
shared worker node
```

The syncer translates or synchronizes resources such as Pods, Services, Secrets and ConfigMaps between the tenant cluster and the underlying cluster.

The tenant sees its own Kubernetes API and resource names.

The provider sees the translated underlying resources.

This gives strong **API/control-plane separation**, but shared worker nodes still mean workloads can share infrastructure and a kernel.

Current vCluster documentation is explicit about that distinction: shared nodes are intended for trusted/internal tenants, development, testing and CI-style use cases rather than being the worker isolation boundary for untrusted external tenants.

Think:

```text
separate tenant API      yes
separate tenant RBAC     yes
separate physical node   no, not necessarily
separate kernel          no, not in shared-node mode
```

## 4.2 Private-node mode

vCluster can instead attach dedicated worker nodes to an individual tenant cluster.

```text
provider control-plane cluster
        |
        +-- tenant A control plane
        |         |
        |         v
        |      tenant A API
        |         |
        |         +---- worker A1
        |         +---- worker A2
        |
        +-- tenant B control plane
                  |
                  v
               tenant B API
                  |
                  +---- worker B1
                  +---- worker B2
```

Now workload isolation is materially different:

```text
tenant A Pods -> tenant A nodes

tenant B Pods -> tenant B nodes
```

The tenant control plane remains provider-hosted while compute can be dedicated to the tenant.

This is the important architectural lesson:

> Control-plane isolation and worker isolation are independent choices.

## 4.3 Taints and dedicated pools are not automatically private nodes

A node selector or taint can constrain placement:

```text
Tenant A workloads
      |
      v
nodes labelled tenant=a
```

That can be operationally useful.

But placement is not identical to isolation.

If several tenants still share the same underlying nodes or kernel, a label did not magically create a VM or hardware boundary.

Likewise a taint is not an authorization rule if the tenant is permitted to add a matching toleration.
