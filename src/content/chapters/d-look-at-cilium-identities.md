List Cilium endpoints:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg endpoint list
```

Look at identities:

```bash
kubectl get ciliumidentities
```

Cilium does not need to think only in terms of transient Pod IP addresses.

It associates workloads with identities derived from labels.

Conceptually:

```text
Pod labels
    |
    v
Cilium identity
    |
    v
policy / dataplane decisions
```

That becomes particularly useful when Pods are recreated and their IP addresses change.

The workload identity can remain logically stable even while endpoints change.
