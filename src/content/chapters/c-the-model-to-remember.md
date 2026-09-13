The CKAD cookbook started with:

```text
Desired state
     |
     v
Kubernetes API
     |
     v
Controller
     |
     v
Actual state
```

We can now expand it:

```text
                      desired state
                            |
                            v
                      Kubernetes API
                            |
               +------------+------------+
               |            |            |
               v            v            v
           scheduler    controllers    Cilium
               |            |            |
               +------------+------------+
                            |
                            v
                         kubelet
                            |
                            v
                        containerd
                            |
                            v
                      Linux kernel
                            |
                            v
                      actual state
```

Same Kubernetes model.

We simply followed it further down.
