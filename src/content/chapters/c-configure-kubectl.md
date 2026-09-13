`kubeadm init` created administrator credentials:

```text
/etc/kubernetes/admin.conf
```

Copy them:

```bash
mkdir -p "$HOME/.kube"

sudo cp \
  /etc/kubernetes/admin.conf \
  "$HOME/.kube/config"

sudo chown \
  "$(id -u):$(id -g)" \
  "$HOME/.kube/config"
```

Check:

```bash
kubectl cluster-info
```

Then:

```bash
kubectl get nodes
```

You should have something similar to:

```text
NAME          STATUS     ROLES           AGE   VERSION
k8s-control   NotReady   control-plane   ...   v1.35.x
```

Excellent.

Kubernetes exists.

It is not yet a working cluster.
