Install on both nodes:

```bash
sudo apt-get update
sudo apt-get install -y containerd
```

Check:

```bash
containerd --version
```

Generate a default config:

```bash
sudo mkdir -p /etc/containerd

containerd config default \
  | sudo tee /etc/containerd/config.toml >/dev/null
```

Kubernetes and the runtime should use the same cgroup model.

Configure containerd to use the `systemd` cgroup driver:

```bash
sudo sed -i \
  's/SystemdCgroup = false/SystemdCgroup = true/' \
  /etc/containerd/config.toml
```

Verify:

```bash
grep -n SystemdCgroup /etc/containerd/config.toml
```

Expected:

```text
SystemdCgroup = true
```

Check that CRI has not been disabled:

```bash
grep disabled_plugins /etc/containerd/config.toml || true
```

If `cri` appears in `disabled_plugins`, remove it.

Restart:

```bash
sudo systemctl restart containerd
sudo systemctl enable containerd
```

Inspect:

```bash
systemctl status containerd --no-pager
```

We now have:

```text
Linux
  |
  v
containerd
```

but no Kubernetes.
