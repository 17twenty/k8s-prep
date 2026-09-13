Before installing anything, keep these roles separate.

## kubectl

Client for the Kubernetes API.

```text
kubectl
   |
   v
kube-apiserver
```

## kubelet

Node agent.

It watches for Pods assigned to its node and asks the container runtime to run them.

```text
API server
    |
    v
 kubelet
    |
    v
containerd
```

## containerd

Container runtime.

The kubelet communicates with it through CRI:

```text
kubelet
   |
   | CRI
   v
containerd
   |
   v
container
```

## kubeadm

Bootstrap and lifecycle tool.

```text
kubeadm
   |
   v
creates/configures Kubernetes
```

It is **not** the daemon continuously running the cluster.

## Cilium

Networking implementation.

```text
Kubernetes networking APIs
          |
          v
        Cilium
          |
          v
Linux / eBPF dataplane
```
