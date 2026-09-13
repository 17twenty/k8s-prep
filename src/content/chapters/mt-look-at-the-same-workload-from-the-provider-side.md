Disconnect from the tenant:

```bash
vcluster disconnect
```

If necessary, explicitly restore the host context:

```bash
kubectl config use-context "$HOST_CONTEXT"
```

Inspect the namespace where the vCluster lives:

```bash
kubectl get pods \
  -n tenant-alice \
  -o wide
```

You should see the tenant control-plane Pod and translated workloads.

A workload created inside the tenant might appear with a rewritten host-side name similar to:

```text
web-xxxxxxxxxx-yyyyy-x-apps-x-alice
```

The exact generated name is not important.

The important relationship is:

```text
TENANT VIEW
-----------
namespace: apps
pod:       web-xxxxx

        |
        | sync / translation
        v

PROVIDER VIEW
-------------
namespace: tenant-alice
pod:       rewritten host-side name
```

In shared-node mode, the vCluster syncer translates workload resources onto the provider cluster so the provider scheduler and kubelets can run them.

The tenant does not need credentials for that provider API.
