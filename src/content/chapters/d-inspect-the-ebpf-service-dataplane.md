List Cilium services:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg service list
```

List the underlying BPF load-balancer state:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg bpf lb list
```

Compare with:

```bash
kubectl get services -A
```

and:

```bash
kubectl get endpointslices -A
```

The layers are:

```text
Kubernetes Service
      |
      v
EndpointSlices
      |
      v
Cilium observes API state
      |
      v
BPF maps
      |
      v
packet forwarding
```

The important idea is not to memorise BPF map output.

It is to understand that the high-level API is compiled into lower-level dataplane state.
