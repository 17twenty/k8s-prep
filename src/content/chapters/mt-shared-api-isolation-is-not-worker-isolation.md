We have proven that Alice has a separate Kubernetes API.

But in this default shared-node model, her nginx workload ultimately runs on the same provider worker infrastructure as other workloads.

```text
Tenant A API         Tenant B API
     |                    |
     v                    v
 translated Pods     translated Pods
       \                  /
        \                /
         v              v
          provider nodes
                |
                v
           shared kernel
```

So:

```text
separate tenant API       yes
separate tenant RBAC      yes
separate host namespace   yes
separate physical node    not necessarily
separate kernel           no, not in shared-node mode
```

Current vCluster guidance treats shared nodes as appropriate for trusted tenants such as internal development, CI and testing.

It explicitly does **not** treat this model as the worker security boundary for untrusted external tenants with arbitrary Kubernetes workload access.

That is not a defect in RBAC.

It is a different layer of the architecture.
