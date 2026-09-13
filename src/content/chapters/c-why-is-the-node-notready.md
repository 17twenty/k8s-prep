Ask Kubernetes:

```bash
kubectl describe node k8s-control
```

Pay attention to:

```text
Conditions
Events
```

Check CoreDNS:

```bash
kubectl get pods \
  -n kube-system \
  -l k8s-app=kube-dns
```

It may still be:

```text
Pending
```

or otherwise unavailable.

Why?

We currently have:

```text
API server       ✓
etcd             ✓
scheduler        ✓
controller       ✓
kubelet          ✓
containerd       ✓

Pod network      ✗
```

`kubeadm` bootstraps Kubernetes.

It does not choose the cluster networking implementation for you.
