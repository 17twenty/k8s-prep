At the beginning of the cookbook:

```text
Service -> Pods
```

was enough.

Now we can expand it:

```text
                         Kubernetes API
                               |
              +----------------+----------------+
              |                |                |
              v                v                v
          Gateway          HTTPRoute        Service
              |                |                |
              +--------+-------+                |
                       |                        |
                       v                        v
                 Cilium controller         EndpointSlice
                       |                        |
                       v                        |
                    Envoy                       |
                       |                        |
                       +-----------+------------+
                                   |
                                   v
                              Cilium agent
                                   |
                                   v
                                eBPF
                                   |
                                   v
                              Linux kernel
                                   |
                                   v
                                  Pod
```

And with observability:

```text
packet / request
      |
      v
Cilium dataplane
      |
      +----> enforcement
      |
      +----> Hubble
               |
               v
          observable flow
```
