A useful tenancy model has several layers.

```text
Layer 1 - identity and API authorization
----------------------------------------
authentication
RBAC
admission

"Can Alice perform this API operation?"


Layer 2 - API / control-plane isolation
---------------------------------------
shared kube-apiserver
or
separate tenant kube-apiservers

"Does Alice even share a Kubernetes API with Bob?"


Layer 3 - workload isolation
----------------------------
namespaces
Pod security
scheduler policy
taints / affinity
separate worker pools
runtime sandboxing

"Can their workloads interfere on compute?"


Layer 4 - network, storage and infrastructure isolation
-------------------------------------------------------
NetworkPolicy
CNI / VPC / VLAN / VRF
CSI and storage policy
VM boundaries
bare-metal allocation
cloud IAM

"What underlying infrastructure do tenants share?"


Layer 5 - provider management plane
-----------------------------------
management cluster
cluster lifecycle controllers
provisioning systems
hardware / cloud APIs

"Who is allowed to change the infrastructure itself?"
```

No single layer replaces all the others.

For example:

```text
separate API servers
      !=
separate kernels
```

```text
NoSchedule taint
      !=
authorization boundary
```

```text
Kubernetes cluster-admin
      !=
SSH root on the machine
```

We are going to prove those distinctions rather than only state them.
