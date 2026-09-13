Even for trusted tenants, the provider should not assume the separate API is sufficient on its own.

For example, vCluster can create host-side NetworkPolicy around the tenant workload namespace:

```yaml
policies:
  networkPolicy:
    enabled: true
```

A more opinionated baseline can look like:

```yaml
policies:
  podSecurityStandard: restricted
  resourceQuota:
    enabled: true
  limitRange:
    enabled: true
  networkPolicy:
    enabled: true
    workload:
      publicEgress:
        enabled: false
sync:
  toHost:
    pods:
      useSecretsForSATokens: true
```

Save that as `vcluster-hardening.yaml`, then apply it as an upgrade:

```bash
vcluster create alice \
  --namespace tenant-alice \
  --upgrade \
  --connect=false \
  -f vcluster-hardening.yaml
```

But do **not** confuse configuration with enforcement.

```text
NetworkPolicy object exists
       !=
CNI actually enforces NetworkPolicy
```

The host CNI must implement the policy.

Likewise:

```text
Pod Security Standard
       !=
separate kernel
```

```text
resource quota
       !=
strong workload isolation
```

Hardening improves the shared-node model. It does not change its fundamental trust boundary.

> `restricted` Pod Security may also break workloads that assume root privileges. Treat that as useful feedback about the workload rather than blindly weakening the platform baseline.
