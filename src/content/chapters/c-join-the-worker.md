On:

```text
k8s-worker
```

run the join command printed by `kubeadm init`.

It will look similar to:

```bash
sudo kubeadm join 192.168.1.20:6443 \
  --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>
```

If you lost it, regenerate one on the control plane:

```bash
kubeadm token create \
  --print-join-command
```

Then run the returned command with `sudo` on the worker.

Back on the control plane:

```bash
kubectl get nodes
```

You should now see:

```text
NAME          STATUS     ROLES           VERSION
k8s-control   NotReady   control-plane   v1.35.x
k8s-worker    NotReady   <none>          v1.35.x
```

This is a useful state.

We have two Kubernetes nodes.

Neither has a working Pod network.
