The rest of our cookbook assumes you already have access to a Kubernetes cluster.

If you do not, `kind` is probably the quickest way to get one.

`kind` means **Kubernetes IN Docker**.

It runs Kubernetes nodes as containers on your machine:

```text
Your machine
    |
    v
Docker
    |
    +-- kind-control-plane
            |
            +-- kube-apiserver
            +-- scheduler
            +-- controller-manager
            +-- kubelet
            +-- containerd
```

This is not how a production Kubernetes cluster is normally deployed.

It is, however, an excellent disposable Kubernetes lab.

---

## Prerequisites

You need:

```text
Docker
kubectl
kind
```

Check Docker:

```bash
docker version
```

Check `kubectl`:

```bash
kubectl version --client
```

If those work, install `kind`.

---

## Install kind

### macOS

With Homebrew:

```bash
brew install kind
```

### Linux

For x86-64:

```bash
curl -Lo ./kind \
  https://kind.sigs.k8s.io/dl/v0.33.0/kind-linux-amd64

chmod +x ./kind

sudo mv ./kind /usr/local/bin/kind
```

For ARM64:

```bash
curl -Lo ./kind \
  https://kind.sigs.k8s.io/dl/v0.33.0/kind-linux-arm64

chmod +x ./kind

sudo mv ./kind /usr/local/bin/kind
```

### Windows

With `winget`:

```powershell
winget install Kubernetes.kind
```

Check it:

```bash
kind version
```
