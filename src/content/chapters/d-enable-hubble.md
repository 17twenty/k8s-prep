Cilium gives us another useful implementation-specific feature:

```text
Hubble
```

Hubble provides network observability over Cilium-managed endpoints.

Enable Relay:

```bash
cilium hubble enable
```

Wait:

```bash
cilium status --wait
```

You should see Hubble Relay become available.
