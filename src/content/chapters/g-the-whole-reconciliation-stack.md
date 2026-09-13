A useful final mental model:

```text
SOURCE CODE
   |
   | developer changes application behaviour
   v
APPLICATION GIT
   |
   | CI reconciles source into an artifact
   v
OCI IMAGE DIGEST
   |
   | promotion automation proposes desired deployment
   v
GITOPS GIT
   |
   | Argo CD reconciles Git into Kubernetes resources
   v
ROLLOUT / DEPLOYMENT SPEC
   |
   | workload controller reconciles replicas
   v
REPLICASETS / PODS
   |
   | kubelet reconciles Pod specs on nodes
   v
CONTAINERS
```

With progressive delivery:

```text
ROLLOUT
   |
   +--> stable ReplicaSet
   |
   +--> canary ReplicaSet
   |
   +--> AnalysisRun
   |
   +--> traffic routing policy
```

With Gateway API:

```text
HTTPRoute desired weight
        |
        v
Gateway controller / Cilium
        |
        v
network dataplane
```

With secrets:

```text
ExternalSecret
      |
      v
secret controller
      |
      v
Kubernetes Secret
```

With a multi-tenant platform:

```text
tenant Git
   |
   v
Argo permissions
   |
   v
tenant API / namespace boundary
   |
   v
worker isolation
```

A modern Kubernetes platform is not one giant program.

It is a set of reconciliation loops with deliberately-designed ownership and trust boundaries.
