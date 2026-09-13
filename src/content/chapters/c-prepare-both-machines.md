Run this section on:

```text
k8s-control
k8s-worker
```

Check hostname:

```bash
hostname
```

Set unique names if necessary.

Control plane:

```bash
sudo hostnamectl set-hostname k8s-control
```

Worker:

```bash
sudo hostnamectl set-hostname k8s-worker
```

Log out and back in if your shell prompt does not immediately reflect the change.

Check addresses:

```bash
ip -4 addr
```

Make sure each machine can reach the other:

```bash
ping -c 2 <other-node-ip>
```
