On each worker:

```bash
sudo kubeadm reset -f
sudo rm -rf /etc/cni/net.d
```

On the control plane:

```bash
sudo kubeadm reset -f
sudo rm -rf /etc/cni/net.d
```

Remove local kubectl credentials:

```bash
rm -rf "$HOME/.kube"
```

For a disposable lab, destroying and recreating the VMs is cleaner still.

That is not cheating.

Reproducible infrastructure is preferable to mysterious state.
