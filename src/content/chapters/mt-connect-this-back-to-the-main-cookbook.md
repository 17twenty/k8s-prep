Nearly everything in this appendix is built from concepts we already learned.

```text
Authentication / RBAC
    -> Chapter 23

SecurityContext / Pod security
    -> Chapter 24

NetworkPolicy
    -> Chapter 25

Taints / scheduling eligibility
    -> scheduling chapters

CRDs
    -> Chapter 33

Controllers
    -> Chapter 34

spec / status / reconciliation
    -> Chapter 1 and everywhere else
```

The platform gets more sophisticated.

The primitive stays familiar:

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

A `Deployment` reconciles Pods.

A vCluster syncer reconciles tenant resources into provider resources.

Kamaji reconciles a `TenantControlPlane` into a running Kubernetes control plane.

Cluster API can reconcile a cluster specification into worker machines.

Once the control-loop model is clear, these systems stop looking magical.
