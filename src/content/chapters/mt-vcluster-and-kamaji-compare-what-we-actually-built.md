We have now used both models instead of only drawing them.

| Question | Shared namespace + RBAC | vCluster shared nodes | Kamaji |
|---|---|---|---|
| Tenant has separate kube-apiserver | No | Yes | Yes |
| Tenant-local RBAC | No separate API | Yes | Yes |
| Tenant can have broad admin without provider-cluster admin | Not as shared `cluster-admin` | Yes | Yes |
| Provider hosts tenant control plane | Shared provider CP | Yes | Yes |
| Tenant workload becomes a Pod on provider cluster | Directly | Yes, translated/synced | No - worker joins tenant API |
| Workers can be shared | Yes | Yes | Not the core model |
| Dedicated workers possible | By platform design | Yes, private nodes | Yes |
| Worker lifecycle bundled into basic control-plane creation | N/A | Depends on worker model | No |
| Provider management credentials required by tenant | Same shared API | No | No |

The important difference is not which product has the longest feature list.

It is **where each architecture places the boundary**.
