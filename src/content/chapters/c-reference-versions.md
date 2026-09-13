This appendix was written against:

```text
Kubernetes: 1.35
Cilium:     1.20.1
```

The Kubernetes 1.35 packages come from the versioned `pkgs.k8s.io` repository.

Cilium 1.20.1 officially supports Kubernetes 1.35.

Cilium's kube-proxy replacement documentation explicitly supports bootstrapping kubeadm with:

```text
--skip-phases=addon/kube-proxy
```

Always check the matching upstream documentation before using these instructions for a newer Kubernetes or Cilium release.
