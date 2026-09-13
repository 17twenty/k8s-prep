If you retain only a few things from this appendix, make them these:

```text
RBAC answers:
"What can this identity do against this Kubernetes API?"
```

```text
A separate tenant API answers:
"Why should this tenant be an administrator of my provider API at all?"
```

```text
Separate API servers do not automatically mean separate workers or kernels.
```

```text
cluster-admin is relative to a cluster/API boundary.
```

```text
control plane exists != worker nodes exist
```

and:

```text
a strong tenant boundary is normally a stack of controls,
not one Kubernetes object or one product.
```
