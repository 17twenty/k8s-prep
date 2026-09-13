In the local quickstart we used:

```bash
kind create cluster
```

and Kubernetes appeared.

That was real Kubernetes.

`kind` itself uses `kubeadm` to bootstrap its nodes.

This appendix performs the interesting pieces ourselves:

```text
Linux
  |
  v
containerd
  |
  v
kubelet
  |
  v
kubeadm
  |
  v
control plane
  |
  v
Cilium
  |
  v
working cluster
```

By the end you should understand what sits underneath:

```text
Deployment
Service
Pod
```

and why a Kubernetes cluster can exist while still being:

```text
NotReady
```
