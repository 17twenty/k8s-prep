The simplest multi-team model is one Kubernetes cluster with one API server.

```text
                         one cluster
                             |
                      kube-apiserver
                             |
              +--------------+--------------+
              |                             |
          namespace A                   namespace B
              |                             |
            Alice                           Bob
              |                             |
             RBAC                          RBAC
```

Alice and Bob authenticate to the same API server.

RBAC can still create a useful administrative boundary:

```text
Alice:
  get Pods in team-a                 yes
  patch Deployments in team-a        yes
  read Secrets in team-b             no
  delete Nodes                       no
  create ClusterRoleBindings         no
```

For trusted internal teams, this can be exactly the right answer.

But notice what remains shared:

```text
kube-apiserver
control-plane policy
cluster-scoped APIs
worker nodes, depending on scheduling
kernel, when workloads share nodes
CNI / CSI / device plugins
parts of the storage and network fabric
```

Namespaces plus RBAC are therefore an **API authorization model**, not a complete answer to every kind of tenancy.
