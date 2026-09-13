On:

```text
k8s-worker
```

stop the kubelet:

```bash
sudo systemctl stop kubelet
```

Back on the control plane:

```bash
kubectl get nodes -w
```

The node eventually stops reporting healthy status.

Inspect:

```bash
kubectl describe node k8s-worker
```

Now restore it:

```bash
sudo systemctl start kubelet
```

Watch again:

```bash
kubectl get nodes -w
```

Important:

```text
containerd may still have containers

but

kubelet is no longer reconciling the node
```

Stopping kubelet does not mean every process on the machine instantly disappears.
