The original question that led us here was roughly:

> How do I let users operate Kubernetes without letting them control the control-plane nodes?

There are several separate meanings hiding inside that sentence.

## 7.1 May the user modify Node API objects?

That is Kubernetes authorization:

```text
User
 |
 v
kube-apiserver
 |
 v
RBAC
 |
 +-- get nodes?       maybe
 +-- delete nodes?    probably not
```

Test with:

```bash
kubectl auth can-i delete nodes --as=alice
```

## 7.2 May the user's Pod run on infrastructure nodes?

That is scheduling and policy:

```text
Pod
 |
 v
scheduler
 |
 +-- node labels / affinity
 +-- taints / tolerations
 +-- admission policy
```

A control-plane `NoSchedule` taint can keep ordinary workloads away.

But if the tenant can add arbitrary tolerations, the taint alone is not a strong trust boundary.

## 7.3 May the user log into the machine?

That is infrastructure security:

```text
cloud IAM
SSH credentials
VPN / firewall
bastion policy
OS accounts
```

Kubernetes RBAC does not revoke someone's SSH key.

## 7.4 Does the tenant need to see the provider control plane at all?

This is the architectural step vCluster and Kamaji make interesting:

```text
tenant
  |
  v
tenant API endpoint

provider management cluster
  |
  X tenant has no direct management credentials
```

Instead of trying to make a shared provider kube-apiserver appear tenant-owned, the provider can give the tenant a separate API boundary.
