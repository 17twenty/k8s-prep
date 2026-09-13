Return to the original access-control question.

A tenant can receive:

```text
/tmp/kamaji-tenant.conf
```

which grants access to:

```text
Tenant A kube-apiserver
```

without receiving credentials for:

```text
kind-kamaji management API
```

and without receiving:

```text
SSH access to the management hosts
```

Those are different trust boundaries:

```text
                     TENANT
                        |
                        v
                 Tenant API endpoint
                        |
                        v
               tenant Kubernetes RBAC

================================================
                  provider boundary
================================================

               Management Cluster API
                        |
               Kamaji / controllers
                        |
                host infrastructure
```

The tenant may be `cluster-admin` above the line.

That does not imply they are administrator below it.
