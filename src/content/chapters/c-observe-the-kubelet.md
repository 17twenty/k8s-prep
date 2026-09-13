On the worker:

```bash
systemctl status kubelet --no-pager
```

Then:

```bash
journalctl -u kubelet \
  --since "10 minutes ago" \
  --no-pager
```

Remember:

```text
API server
    ^
    |
 kubelet
    |
    v
containerd
    |
    v
   Pods
```

The kubelet:

```text
registers the Node
watches assigned Pods
starts containers
mounts volumes
runs probes
reports status
```

It is the bridge between Kubernetes desired state and a Linux machine.
