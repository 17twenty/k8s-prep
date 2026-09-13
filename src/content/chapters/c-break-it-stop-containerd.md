On the worker:

```bash
sudo systemctl stop containerd
```

Watch the kubelet:

```bash
journalctl -u kubelet -f
```

The dependency is:

```text
kubelet
   |
   | CRI
   v
containerd
```

No runtime means the kubelet cannot manage containers correctly.

Restore it:

```bash
sudo systemctl start containerd
sudo systemctl restart kubelet
```

Then:

```bash
kubectl get nodes
kubectl get pods -A
```
