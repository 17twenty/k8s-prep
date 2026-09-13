# Supplemental - Run Kubernetes Locally with `kind` [DEV]

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

---

# Create the Cluster

The cookbook targets Kubernetes 1.35.

Create a cluster called `ckad` using Kubernetes 1.35:

```bash
kind create cluster \
  --name ckad \
  --image kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0 \
  --wait 2m
```

`kind` will:

```text
create a container
        |
        v
turn it into a Kubernetes node
        |
        v
bootstrap Kubernetes
        |
        v
write kubeconfig
        |
        v
switch kubectl to the new cluster
```

Check:

```bash
kind get clusters
```

Expected:

```text
ckad
```

Check your Kubernetes context:

```bash
kubectl config current-context
```

Expected:

```text
kind-ckad
```

---

## Observe the Cluster

Ask Kubernetes what nodes exist:

```bash
kubectl get nodes
```

You should see something similar to:

```text
NAME                 STATUS   ROLES           AGE   VERSION
ckad-control-plane   Ready    control-plane   1m    v1.35.x
```

More detail:

```bash
kubectl get nodes -o wide
```

Check the control plane:

```bash
kubectl cluster-info
```

And see the system workloads Kubernetes created:

```bash
kubectl get pods -n kube-system
```

At this point you have a real Kubernetes API to experiment with.

---

# Look Underneath

Remember that the Kubernetes node is actually a container.

Ask Docker:

```bash
docker ps
```

You should see:

```text
ckad-control-plane
```

So the relationship is:

```text
kubectl
   |
   v
Kubernetes API
   |
   v
ckad-control-plane
   |
   v
Docker container
```

From this point onwards, mostly forget about Docker.

Interact with the cluster through the Kubernetes API.

---

# Start the Cookbook

Your cluster now exists.

Continue with **Section 0 - Lab Setup**.

Create the cookbook namespace:

```bash
kubectl create namespace cookbook
```

Make it the default namespace:

```bash
kubectl config set-context \
  --current \
  --namespace=cookbook
```

Check:

```bash
kubectl config view --minify \
  -o jsonpath='{..namespace}{"\n"}'
```

Expected:

```text
cookbook
```

You are now ready for the rest of the cookbook.

---

# One kind-specific trick worth knowing

Later you may build your own container image locally.

For example:

```bash
docker build -t my-app:v1 .
```

That image exists on your machine, but it does **not automatically exist inside the kind node**.

Load it:

```bash
kind load docker-image my-app:v1 --name ckad
```

Then Kubernetes can use it:

```bash
kubectl run my-app \
  --image=my-app:v1 \
  --image-pull-policy=IfNotPresent
```

This:

```text
docker build
     |
     v
Host image
     |
     | kind load docker-image
     v
kind node
     |
     v
Pod
```

is useful when testing applications without pushing every image to a registry.

Avoid using the `latest` tag for this workflow. Kubernetes normally treats `:latest` as `imagePullPolicy: Always`, which may cause it to try pulling the image from a registry instead of using the image you loaded locally.

---

# Reset the Lab

One of the best features of `kind` is that the entire cluster is disposable.

Destroy it:

```bash
kind delete cluster --name ckad
```

Check:

```bash
kind get clusters
```

Then recreate it whenever you want:

```bash
kind create cluster \
  --name ckad \
  --image kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0 \
  --wait 2m
```

A completely broken lab is therefore not a disaster.

Sometimes deleting it and starting again is exactly the point.
