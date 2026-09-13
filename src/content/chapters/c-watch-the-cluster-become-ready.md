Check:

```bash
kubectl get nodes
```

We want:

```text
NAME          STATUS   ROLES           VERSION
k8s-control   Ready    control-plane   v1.35.x
k8s-worker    Ready    <none>          v1.35.x
```

What changed?

```text
Kubernetes exists
       |
       v
Nodes NotReady
       |
       | install Cilium
       v
CNI available
       |
       v
Pod networking available
       |
       v
Nodes Ready
```

Check Cilium:

```bash
cilium status --wait
```

Run the connectivity test:

```bash
cilium connectivity test
```

The test creates workloads and verifies the dataplane rather than merely checking whether Pods exist.
