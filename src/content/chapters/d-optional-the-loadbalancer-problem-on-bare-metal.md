A Kubernetes Service can say:

```yaml
spec:
  type: LoadBalancer
```

but that does not magically create an external load balancer.

Again:

```text
API object exists
```

does not imply:

```text
implementation exists
```

On bare metal someone still needs to answer:

```text
Who allocates the external IP?

Who advertises it onto the network?

Who makes traffic reach the nodes?
```

Cilium can participate in those layers with:

```text
LB IPAM
L2 Announcements
BGP Control Plane
Node IPAM LB
```

Those are excellent platform-engineering topics.

They are intentionally outside this first Gateway API lab.
