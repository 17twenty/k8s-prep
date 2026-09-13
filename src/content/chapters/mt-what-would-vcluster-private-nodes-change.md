vCluster also supports a model where tenant workers are not shared with the provider worker pool.

This requires vCluster Platform and separate Linux worker machines, so it is not part of our simple `kind-ckad` lab.

The configuration begins with something like:

```yaml
privateNodes:
  enabled: true
  vpn:
    enabled: true
networking:
  podCIDR: 10.64.0.0/16
  serviceCIDR: 10.128.0.0/16
```

A private-node tenant cluster is created with:

```bash
vcluster create alice-private \
  --namespace tenant-alice-private \
  --values vcluster-private.yaml
```

An interesting thing happens immediately:

```bash
kubectl get nodes
```

Expected before joining any workers:

```text
No resources found.
```

That is not a broken cluster.

```text
control plane exists
       !=
worker nodes exist
```

Once private workers are joined:

```text
Alice tenant API
      |
      v
Alice private workers

Bob tenant API
      |
      v
Bob private workers
```

The provider-hosted control plane and tenant compute have become separate choices.
