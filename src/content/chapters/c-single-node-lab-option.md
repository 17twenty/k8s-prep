If you only have one Linux machine, most of this appendix still works.

The control-plane node normally has a taint preventing ordinary workloads from being scheduled there.

Check:

```bash
kubectl describe node k8s-control \
  | grep -A5 Taints
```

For a disposable single-node lab:

```bash
kubectl taint nodes k8s-control \
  node-role.kubernetes.io/control-plane-
```

Now normal workloads may be scheduled there.

This is useful for learning.

It is not our preferred production topology.
