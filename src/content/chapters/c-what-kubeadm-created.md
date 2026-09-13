Inspect system Pods:

```bash
kubectl get pods \
  -n kube-system \
  -o wide
```

Look for:

```text
etcd
kube-apiserver
kube-controller-manager
kube-scheduler
coredns
```

Now inspect the host:

```bash
sudo ls -l /etc/kubernetes/manifests
```

You should find:

```text
etcd.yaml
kube-apiserver.yaml
kube-controller-manager.yaml
kube-scheduler.yaml
```

These are **static Pods**.

```text
/etc/kubernetes/manifests
          |
          v
       kubelet
          |
          v
    static Pods
          |
    +-----+-----+----------+-----------+
    |           |          |           |
    v           v          v           v
 API server   etcd     scheduler   controller
```

No Deployment created them.

No ReplicaSet owns them.

The kubelet watches that directory.

Inspect the API server:

```bash
kubectl -n kube-system get pods \
  -l component=kube-apiserver
```

Then:

```bash
kubectl -n kube-system describe pod \
  "$(kubectl -n kube-system get pod \
      -l component=kube-apiserver \
      -o jsonpath='{.items[0].metadata.name}')"
```

The API contains a mirror Pod representing the static Pod managed by the node's kubelet.
