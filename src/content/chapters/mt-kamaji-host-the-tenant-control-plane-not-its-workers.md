Kamaji approaches the broad problem differently.

Instead of every tenant owning dedicated control-plane VMs, Kamaji runs upstream Kubernetes control-plane components as workloads inside a provider-operated **Management Cluster**.

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
             v                                 v
      tenant A workers                   tenant B workers
```

This creates a clean separation:

```text
control-plane lifecycle
        |
        v
provider management cluster

worker lifecycle
        |
        v
VMs / bare metal / Cluster API / other provisioning
```

Let's build one.
