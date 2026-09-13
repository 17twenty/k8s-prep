Check:

```bash
swapon --show
```

For this lab disable swap:

```bash
sudo swapoff -a
```

Check again:

```bash
swapon --show
```

It should return nothing.

For a persistent lab also disable the swap entry in:

```text
/etc/fstab
```

Modern Kubernetes can be configured to use swap, but the default kubelet behaviour used by this lab expects it to be disabled.
