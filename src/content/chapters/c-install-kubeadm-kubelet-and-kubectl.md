Run on both nodes.

Install repository prerequisites:

```bash
sudo apt-get update

sudo apt-get install -y \
  apt-transport-https \
  ca-certificates \
  curl \
  gpg
```

Create the keyring directory:

```bash
sudo mkdir -p -m 755 /etc/apt/keyrings
```

Add the Kubernetes 1.35 repository key:

```bash
curl -fsSL \
  https://pkgs.k8s.io/core:/stable:/v1.35/deb/Release.key \
  | sudo gpg --dearmor \
  -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
```

Add the repository:

```bash
echo \
  'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.35/deb/ /' \
  | sudo tee /etc/apt/sources.list.d/kubernetes.list
```

Install:

```bash
sudo apt-get update

sudo apt-get install -y \
  kubelet \
  kubeadm \
  kubectl
```

Hold the packages so an ordinary system upgrade does not unexpectedly move the cluster to a different Kubernetes version:

```bash
sudo apt-mark hold \
  kubelet \
  kubeadm \
  kubectl
```

Check:

```bash
kubeadm version
kubectl version --client
kubelet --version
```

Enable kubelet:

```bash
sudo systemctl enable --now kubelet
```

Inspect:

```bash
systemctl status kubelet --no-pager
```

It may be unhealthy.

That is fine.

We have installed the node agent but have not told it what cluster it belongs to.

Look at its logs:

```bash
journalctl -u kubelet -n 30 --no-pager
```

Do not fix random errors yet.

We are missing the cluster.
