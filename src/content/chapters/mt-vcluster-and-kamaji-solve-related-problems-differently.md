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
