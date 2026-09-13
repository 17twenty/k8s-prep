Drain it first:

```bash
kubectl drain k8s-worker \
  --ignore-daemonsets \
  --delete-emptydir-data \
  --force
```

On the worker:

```bash
sudo kubeadm reset -f
```

Remove CNI configuration left on disk:

```bash
sudo rm -rf /etc/cni/net.d
```

Back on the control plane:

```bash
kubectl delete node k8s-worker
```

Check:

```bash
kubectl get nodes
```

`kubeadm reset` is a best-effort reset.

It does not promise to return the operating system to its exact pre-Kubernetes state.

That is one reason disposable VMs make excellent learning environments.
