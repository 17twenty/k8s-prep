This companion starts where the main cookbook's RBAC chapter stops.

The question is no longer only:

> What may this identity do inside Kubernetes?

It is now:

> What boundary should exist between tenants in the first place?

This is platform-engineering material, not CKAD material.

The goal is **not** to memorise product-specific commands. We will use ordinary RBAC, vCluster and Kamaji as hands-on experiments to make API, control-plane and worker isolation concrete.

By the end we will have built three different models:

```text
one shared API
    + namespace RBAC

separate tenant API
    + shared workers

separate tenant API
    + hosted control plane
    + independently joined workers
```

The vCluster lab assumes you are continuing from the cookbook's existing `kind-ckad` cluster. The Kamaji lab deliberately creates a second kind cluster so that experimentation does not disturb the CKAD environment.
