The original question was roughly:

> How do I let users operate Kubernetes without letting them control the control-plane nodes?

There were actually four questions hiding inside it.

## 26.1 May Alice modify the Node API object?

That is Kubernetes authorization:

```bash
kubectl auth can-i delete nodes \
  --as=alice
```

RBAC answers this.

## 26.2 May Alice's Pod run on a particular node?

That is scheduling and admission policy:

```text
nodeSelector
affinity
taints / tolerations
admission
```

A control-plane `NoSchedule` taint is useful placement policy.

It is not a hard authorization boundary if Alice is allowed to submit arbitrary tolerations.

## 26.3 May Alice log into the machine?

That is infrastructure access:

```text
cloud IAM
SSH keys
VPN / firewall
bastions
OS users
```

Kubernetes RBAC does not remove Alice's SSH key.

## 26.4 Does Alice need to see the provider API at all?

That is the architectural question we explored here:

```text
shared cluster
    |
    +-- Alice and provider use same API

versus

tenant control plane
    |
    +-- Alice uses tenant API
    +-- provider API remains provider-only
```

This fourth option can dramatically reduce how much permission engineering has to happen inside the provider cluster.
