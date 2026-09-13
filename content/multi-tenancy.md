# Appendix - From RBAC to Multi-Tenant Kubernetes [DEV] [DEEP DIVE]

This companion starts where the main cookbook's RBAC chapter stops.

The question is no longer only:

> What may this identity do inside Kubernetes?

It is now:

> What boundary should exist between tenants in the first place?

This is platform-engineering material, not CKAD material.

The goal is not to memorise vCluster or Kamaji commands. It is to understand the architectural problem they solve and which security boundaries they do **not** replace.

---

# 1. One Shared Cluster: Namespace + RBAC

The simplest multi-team model is one Kubernetes cluster with one API server.

```text
                         one cluster
                             |
                      kube-apiserver
                             |
              +--------------+--------------+
              |                             |
          namespace A                   namespace B
              |                             |
            Alice                           Bob
              |                             |
             RBAC                          RBAC
```

Alice and Bob authenticate to the same API server.

RBAC can still create a useful administrative boundary:

```text
Alice:
  get Pods in team-a                 yes
  patch Deployments in team-a        yes
  read Secrets in team-b             no
  delete Nodes                       no
  create ClusterRoleBindings         no
```

For trusted internal teams, this can be exactly the right answer.

But notice what remains shared:

```text
kube-apiserver
control-plane policy
cluster-scoped APIs
worker nodes, depending on scheduling
kernel, when workloads share nodes
CNI / CSI / device plugins
parts of the storage and network fabric
```

Namespaces plus RBAC are therefore an **API authorization model**, not a complete answer to every kind of tenancy.

---

# 2. Think in Isolation Layers

A useful tenancy model has several layers.

```text
Layer 1 - identity and API authorization
----------------------------------------
authentication
RBAC
admission

"Can Alice perform this API operation?"


Layer 2 - API / control-plane isolation
---------------------------------------
shared kube-apiserver
or
separate tenant kube-apiservers

"Does Alice even share a Kubernetes API with Bob?"


Layer 3 - workload isolation
----------------------------
namespaces
Pod security
scheduler policy
taints / affinity
separate worker pools
runtime sandboxing

"Can their workloads interfere on compute?"


Layer 4 - network, storage and infrastructure isolation
-------------------------------------------------------
NetworkPolicy
CNI / VPC / VLAN / VRF
CSI and storage policy
VM boundaries
bare-metal allocation
cloud IAM

"What underlying infrastructure do tenants share?"


Layer 5 - provider management plane
-----------------------------------
management cluster
cluster lifecycle controllers
provisioning systems
hardware / cloud APIs

"Who is allowed to change the infrastructure itself?"
```

No single layer magically replaces all of the others.

For example:

```text
separate API servers
      !=
separate kernels
```

and:

```text
separate worker nodes
      !=
separate management credentials
```

---

# 3. Why Give a Tenant Its Own API Server?

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

---

# 4. vCluster: A Tenant Kubernetes API Above Provider Infrastructure

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

---

# 5. Kamaji: Hosted Upstream Control Planes

Kamaji approaches the problem differently.

Instead of giving every Kubernetes cluster dedicated control-plane machines, Kamaji runs tenant Kubernetes control-plane components as workloads inside a provider-operated **Management Cluster**.

Conceptually:

```text
                       Management Cluster

                         Kamaji operator
                               |
              +----------------+----------------+
              |                                 |
              v                                 v
       Tenant A control plane            Tenant B control plane
       kube-apiserver                    kube-apiserver
       controller-manager                controller-manager
       scheduler                         scheduler
              |                                 |
              v                                 v
       tenant A API endpoint              tenant B API endpoint
              |                                 |
          tenant A workers                    tenant B workers
```

The control-plane components are upstream Kubernetes components rather than tenant-owned control-plane VMs.

A tenant still sees a normal Kubernetes API endpoint and kubeconfig.

The worker nodes are ordinary Kubernetes workers - VMs or bare-metal servers - that join their Tenant Control Plane just as they would join a conventional cluster.

So instead of:

```text
Tenant A cluster
  +-- control-plane VM 1
  +-- control-plane VM 2
  +-- control-plane VM 3
  +-- worker 1
  +-- worker 2
```

we can have:

```text
provider management cluster
  +-- Tenant A control-plane Pods
  +-- Tenant B control-plane Pods
  +-- Tenant C control-plane Pods

Tenant A infrastructure
  +-- worker 1
  +-- worker 2
```

The tenant receives access to:

```text
Tenant A kube-apiserver
```

without needing access to:

```text
the Linux hosts running the Management Cluster
```

That cleanly demonstrates the distinction from the main cookbook:

```text
Kubernetes API administration
        !=
machine administration
```

## 5.1 TenantControlPlane is itself declarative Kubernetes

Kamaji exposes a `TenantControlPlane` custom resource.

Conceptually:

```text
TenantControlPlane spec
          |
          v
Kamaji controller
          |
          v
control-plane Deployment / Service / datastore configuration
          |
          v
TenantControlPlane status
```

This should look very familiar after the cookbook's CRD and controller chapters.

Kamaji is Kubernetes reconciliation being used to create and operate more Kubernetes control planes.

---

# 6. vCluster and Kamaji Solve Related Problems Differently

A simplified comparison is:

| Question | Namespace + RBAC | vCluster | Kamaji |
|---|---|---|---|
| Separate tenant API server | No | Yes | Yes |
| Tenant-local RBAC | Shared API scope | Yes | Yes |
| Tenant can be admin without provider-cluster admin | Not safely as cluster-admin | Yes, inside tenant cluster | Yes, inside tenant cluster |
| Provider hosts tenant control plane | Shared cluster CP | Yes | Yes |
| Shared-worker option | Yes | Yes | Not the core Kamaji model |
| Dedicated tenant workers | Possible by platform design | Yes, private-node model | Yes, normal tenant workers |
| Workloads projected into provider cluster | Native shared resources | In shared-node mode | No - workers join tenant CP |
| Upstream-style tenant control plane | Same shared CP | vCluster tenant CP implementation | Yes, upstream Kubernetes components |
| Primary abstraction | permissions inside one cluster | tenant cluster / virtualized control plane | hosted TenantControlPlane |

Do not read this table as a product scorecard.

The useful question is:

> Where is the boundary I actually need?

---

# 7. The Control-Plane Node Question Revisited

The original question that led us here was roughly:

> How do I let users operate Kubernetes without letting them control the control-plane nodes?

There are several separate meanings hiding inside that sentence.

## 7.1 May the user modify Node API objects?

That is Kubernetes authorization:

```text
User
 |
 v
kube-apiserver
 |
 v
RBAC
 |
 +-- get nodes?       maybe
 +-- delete nodes?    probably not
```

Test with:

```bash
kubectl auth can-i delete nodes --as=alice
```

## 7.2 May the user's Pod run on infrastructure nodes?

That is scheduling and policy:

```text
Pod
 |
 v
scheduler
 |
 +-- node labels / affinity
 +-- taints / tolerations
 +-- admission policy
```

A control-plane `NoSchedule` taint can keep ordinary workloads away.

But if the tenant can add arbitrary tolerations, the taint alone is not a strong trust boundary.

## 7.3 May the user log into the machine?

That is infrastructure security:

```text
cloud IAM
SSH credentials
VPN / firewall
bastion policy
OS accounts
```

Kubernetes RBAC does not revoke someone's SSH key.

## 7.4 Does the tenant need to see the provider control plane at all?

This is the architectural step vCluster and Kamaji make interesting:

```text
tenant
  |
  v
tenant API endpoint

provider management cluster
  |
  X tenant has no direct management credentials
```

Instead of trying to make a shared provider kube-apiserver appear tenant-owned, the provider can give the tenant a separate API boundary.

---

# 8. Stronger Tenancy Is a Stack of Controls

For an untrusted external tenant, a design may need something closer to:

```text
Tenant identity
    |
    v
Tenant API server
    |
    +-- tenant-local RBAC
    +-- admission / policy
    |
    v
Dedicated or strongly isolated compute
    |
    +-- runtime security
    +-- device isolation
    |
    v
Tenant network boundary
    |
    +-- NetworkPolicy
    +-- VPC / VLAN / routing policy as appropriate
    |
    v
Tenant storage boundary
    |
    +-- CSI / volume policy
    +-- encryption / credentials
    |
    v
Provider management plane
    |
    X tenant credentials do not cross this boundary
```

The exact implementation varies, but the model is portable.

The mistake to avoid is assuming one control implies all the others.

For example:

```text
RBAC
  != NetworkPolicy
  != node isolation
  != VM isolation
  != storage isolation
  != host IAM
```

---

# 9. A Useful Decision Sequence

When designing a platform, ask these questions in order.

```text
1. Are the tenants mutually trusted?
        |
        +-- yes -> shared cluster + namespace/RBAC may be sufficient
        |
        +-- no  -> continue

2. Do tenants need broad Kubernetes administration?
        |
        +-- yes -> consider separate tenant API/control-plane boundaries

3. Can tenants execute arbitrary workloads?
        |
        +-- yes -> decide what worker/kernel isolation is required

4. Can workloads communicate across tenants?
        |
        +-- no -> enforce network boundaries

5. Can storage or devices be shared safely?
        |
        +-- design CSI/device/IOMMU/etc. boundaries accordingly

6. Can tenant credentials reach the provider management plane?
        |
        +-- they generally should not
```

That decision sequence is more useful than starting with a product name.

---

# 10. Connect This Back to the Cookbook

Nearly everything in this architecture comes from concepts we already learned.

```text
Authentication / RBAC
    -> Chapter 23

SecurityContext
    -> Chapter 24

NetworkPolicy
    -> Chapter 25

Taints / scheduling eligibility
    -> scheduling concepts

CRDs
    -> Chapter 33

Controllers
    -> Chapter 34

spec / status / reconciliation
    -> Chapter 1 and everywhere else
```

Even sophisticated multi-tenant Kubernetes platforms are built from the same recurring idea:

```text
API object
   |
   v
desired state
   |
   v
controller
   |
   v
lower-level infrastructure
   |
   v
status
```

The abstraction changes.

The control loop does not.

---

# 11. Official References

The architecture of these projects evolves, so use their current documentation when making a real platform decision.

- vCluster architecture: https://www.vcluster.com/docs/vcluster/introduction/architecture/
- vCluster worker-node model: https://www.vcluster.com/docs/vcluster/production-guide/choose-worker-node-model/
- vCluster syncer: https://www.vcluster.com/docs/vcluster/configure/vcluster-yaml/sync/
- Kamaji Tenant Control Plane: https://kamaji.clastix.io/concepts/tenant-control-plane/
- Kamaji Tenant Worker Nodes: https://kamaji.clastix.io/concepts/tenant-worker-nodes/
- Kubernetes authentication: https://kubernetes.io/docs/reference/access-authn-authz/authentication/
- Kubernetes RBAC: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
- Kubernetes authorization: https://kubernetes.io/docs/reference/access-authn-authz/authorization/
