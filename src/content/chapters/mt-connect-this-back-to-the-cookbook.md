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
