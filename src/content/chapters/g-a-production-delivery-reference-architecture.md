Putting the pieces together:

```text
                         DEVELOPER
                             |
                             | pull request
                             v
                    APPLICATION REPOSITORY
                             |
                    review / tests / merge
                             |
                             v
                            CI
                  +----------+----------+
                  |                     |
               build                 test/scan
                  |                     |
                  +----------+----------+
                             |
                             v
                       OCI REGISTRY
                     Harbor / GHCR
                             |
                  +----------+----------+
                  |                     |
              image digest          signature
              SBOM                  provenance
                  |                     |
                  +----------+----------+
                             |
                             v
                     PROMOTION AUTOMATION
                             |
                             | opens PR
                             v
                       GITOPS REPOSITORY
                             |
                   review / policy / merge
                             |
                             v
                          ARGO CD
                             |
                             v
                     KUBERNETES API
                             |
                  +----------+----------+
                  |                     |
             Argo Rollouts         other controllers
                  |
        +---------+---------+
        |                   |
   stable ReplicaSet    canary ReplicaSet
        |                   |
        +---------+---------+
                  |
        Gateway API / Cilium
                  |
                  v
                USERS
```

Underneath this application-delivery plane may be another platform layer:

```text
cluster lifecycle
      |
      +-- managed cloud Kubernetes
      +-- Cluster API
      +-- Kamaji
      +-- vCluster
      +-- metal provisioning
      +-- networking / storage
```

GitOps is not the entire platform.

It is one extremely useful reconciliation boundary inside the platform.
