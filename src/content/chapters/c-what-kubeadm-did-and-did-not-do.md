kubeadm helped bootstrap:

```text
certificates
kubeconfigs
control-plane static Pods
etcd
bootstrap tokens
kubelet configuration
RBAC bootstrap
cluster configuration
```

It did **not** choose:

```text
our container runtime
our production topology
our CNI
our storage implementation
our Gateway implementation
our observability platform
our application workloads
```

`kubeadm` creates the Kubernetes foundation.

It does not create an entire application platform.
