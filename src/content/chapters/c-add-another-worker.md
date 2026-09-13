Generate a new join command:

```bash
kubeadm token create \
  --print-join-command
```

Run it with `sudo` on another prepared worker.

Then:

```bash
kubectl get nodes
```

Cilium runs as a DaemonSet, so an agent will be scheduled onto the new node automatically.

Again:

```text
new Node
   |
   v
DaemonSet desired state changes
   |
   v
Cilium agent appears
```
