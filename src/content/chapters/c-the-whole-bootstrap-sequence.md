```text
Linux
  |
  v
containerd
  |
  | CRI
  v
kubelet
  |
  ^
  |
kubeadm
  |
  v
control plane
  |
  +--> API server
  +--> etcd
  +--> scheduler
  +--> controller-manager
  |
  v
Kubernetes exists
  |
  | but
  v
Nodes NotReady
  |
  | install
  v
Cilium
  |
  +--> CNI
  +--> eBPF dataplane
  +--> kube-proxy replacement
  |
  v
Nodes Ready
  |
  v
Pods / Services / Deployments
```

Compare that to:

```bash
kind create cluster
```

`kind` was not fake Kubernetes.

It was automating most of this journey for us.
