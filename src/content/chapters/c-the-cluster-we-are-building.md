Our final topology:

```text
                         k8s-control
                              |
                 +------------+-------------+
                 |            |             |
                 v            v             v
              API server   scheduler    controller
                 |
                 v
                etcd
                 |
                 |
        Kubernetes API :6443
                 |
          +------+------+
          |             |
          v             v
     k8s-control    k8s-worker
          |             |
       kubelet        kubelet
          |             |
      containerd     containerd
          |             |
          +------+------+
                 |
               Cilium
                 |
                 v
             Pod network
```

We will deliberately **not install kube-proxy**.

Cilium will later provide:

```text
CNI
+
Pod networking
+
NetworkPolicy enforcement
+
Kubernetes Service load balancing
+
kube-proxy replacement
```
