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
