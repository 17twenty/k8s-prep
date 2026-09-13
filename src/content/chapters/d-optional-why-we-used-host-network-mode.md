By default, Cilium's Gateway controller creates a:

```text
Service type=LoadBalancer
```

That works naturally when a platform already provides a LoadBalancer implementation.

Our kubeadm lab does not.

Possible real-world solutions include:

```text
cloud load balancer integration
Cilium LB IPAM + L2 announcements
Cilium LB IPAM + BGP
external load balancer
Cilium host-network Gateway mode
```

For this lab we chose:

```text
host-network mode
```

because it lets us focus on:

```text
Gateway API
Cilium
Envoy
routing
policy
observability
```

without first building an entire bare-metal load-balancer control plane.

That is a learning choice, not a universal production recommendation.
