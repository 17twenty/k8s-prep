The core cookbook deliberately favoured APIs such as:

```text
Service
NetworkPolicy
Ingress
```

because they are portable Kubernetes APIs.

This appendix used:

```text
Gateway API
```

which is portable across conformant Gateway implementations.

Then we deliberately crossed into:

```text
CiliumNetworkPolicy
Cilium identities
Hubble
eBPF maps
Cilium host-network Gateway mode
```

Those are implementation-specific.

That is not inherently bad.

It is a tradeoff.

```text
Portable API
    |
    +--> easier platform portability
    |
    +--> common Kubernetes mental model


Implementation-specific API
    |
    +--> richer platform capability
    |
    +--> tighter coupling to the implementation
```

The important thing is to know which side of the boundary you are on.
