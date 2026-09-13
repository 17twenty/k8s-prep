The progression through these cookbooks now looks approximately like this:

```text
LEVEL 1 - Kubernetes user

Pod
Deployment
Service
ConfigMap
Secret
PVC
probes

        |
        v

LEVEL 2 - Kubernetes developer

rollouts
resources
scheduling
RBAC
Kustomize
Helm
Gateway API

        |
        v

LEVEL 3 - Kubernetes internals

spec / status
controllers
CRDs
ownerReferences
finalizers
custom Go reconciler

        |
        v

LEVEL 4 - delivery engineer

OCI images
immutable digests
CI
GitOps
Argo CD
promotion PRs
progressive delivery
rollback

        |
        v

LEVEL 5 - platform engineer

AppProjects
multi-tenancy
hosted control planes
Gateway API / Cilium
registry policy
artifact trust
secret systems
fleet management
ApplicationSets
observability
policy

        |
        v

LEVEL 6 - platform designer

Who owns desired state?
Where are trust boundaries?
Which controller owns each resource?
How does software move between environments?
How is privilege constrained?
How do we prove what is running?
How does the platform fail safely?
```

The tools will change.

Those questions age much more slowly.
