A runnable companion to the Kubernetes application developer cookbook.
It is intentionally **CKA / platform-engineering territory**.

Target stack:

```text
Kubernetes 1.35
containerd
kubeadm
kubelet
Cilium 1.20.1
kube-proxy replacement
```

The lab assumes Ubuntu/Debian-style Linux machines.

For the best experience use two disposable Linux VMs:

```text
k8s-control
  2+ CPU
  2+ GiB RAM

k8s-worker
  2+ GiB RAM
```

Both machines must be able to reach each other directly.

The point is not merely to make Kubernetes work.

The point is to watch it **not work yet**, understand why, and then add the missing pieces.
