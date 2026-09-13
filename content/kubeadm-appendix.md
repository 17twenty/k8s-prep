# Appendix C - Build Kubernetes on Linux with kubeadm

A runnable companion to the Kubernetes application developer cookbook.
It is intentionally **CKA / platform-engineering territory**.

Target stack:

```text
Kubernetes 1.35
containerd
kubeadm
kubelet
Cilium 1.20.1
kube-proxy replacement
```

The lab assumes Ubuntu/Debian-style Linux machines.

For the best experience use two disposable Linux VMs:

```text
k8s-control
  2+ CPU
  2+ GiB RAM

k8s-worker
  2+ GiB RAM
```

Both machines must be able to reach each other directly.

The point is not merely to make Kubernetes work.

The point is to watch it **not work yet**, understand why, and then add the missing pieces.

---

# C.1 What kind Was Hiding

In the local quickstart we used:

```bash
kind create cluster
```

and Kubernetes appeared.

That was real Kubernetes.

`kind` itself uses `kubeadm` to bootstrap its nodes.

This appendix performs the interesting pieces ourselves:

```text
Linux
  |
  v
containerd
  |
  v
kubelet
  |
  v
kubeadm
  |
  v
control plane
  |
  v
Cilium
  |
  v
working cluster
```

By the end you should understand what sits underneath:

```text
Deployment
Service
Pod
```

and why a Kubernetes cluster can exist while still being:

```text
NotReady
```

---

# C.2 The Cluster We Are Building

Our final topology:

```text
                         k8s-control
                              |
                 +------------+-------------+
                 |            |             |
                 v            v             v
              API server   scheduler    controller
                 |
                 v
                etcd
                 |
                 |
        Kubernetes API :6443
                 |
          +------+------+
          |             |
          v             v
     k8s-control    k8s-worker
          |             |
       kubelet        kubelet
          |             |
      containerd     containerd
          |             |
          +------+------+
                 |
               Cilium
                 |
                 v
             Pod network
```

We will deliberately **not install kube-proxy**.

Cilium will later provide:

```text
CNI
+
Pod networking
+
NetworkPolicy enforcement
+
Kubernetes Service load balancing
+
kube-proxy replacement
```

---

# C.3 Know the Pieces

Before installing anything, keep these roles separate.

## kubectl

Client for the Kubernetes API.

```text
kubectl
   |
   v
kube-apiserver
```

## kubelet

Node agent.

It watches for Pods assigned to its node and asks the container runtime to run them.

```text
API server
    |
    v
 kubelet
    |
    v
containerd
```

## containerd

Container runtime.

The kubelet communicates with it through CRI:

```text
kubelet
   |
   | CRI
   v
containerd
   |
   v
container
```

## kubeadm

Bootstrap and lifecycle tool.

```text
kubeadm
   |
   v
creates/configures Kubernetes
```

It is **not** the daemon continuously running the cluster.

## Cilium

Networking implementation.

```text
Kubernetes networking APIs
          |
          v
        Cilium
          |
          v
Linux / eBPF dataplane
```

---

# C.4 Prepare Both Machines

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

---

# C.5 Disable Swap

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

---

# C.6 Enable IPv4 Forwarding

Create:

```bash
cat <<'EOF' | sudo tee /etc/sysctl.d/k8s.conf
net.ipv4.ip_forward = 1
EOF
```

Apply:

```bash
sudo sysctl --system
```

Check:

```bash
sysctl net.ipv4.ip_forward
```

Expected:

```text
net.ipv4.ip_forward = 1
```

This is our first reminder that Kubernetes networking eventually becomes ordinary Linux networking.

---

# C.7 Install containerd

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

---

# C.8 Install kubeadm, kubelet and kubectl

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

---

# C.9 Initialise the Control Plane

Run this section only on:

```text
k8s-control
```

Find the IP address the worker can use to reach the control plane:

```bash
ip -4 addr
```

For example:

```text
192.168.1.20
```

Set it:

```bash
export CONTROL_PLANE_IP=192.168.1.20
```

Confirm:

```bash
echo "$CONTROL_PLANE_IP"
```

Check the Kubernetes version installed:

```bash
kubeadm version -o short
```

Save it:

```bash
export K8S_VERSION="$(kubeadm version -o short)"
```

Now initialise Kubernetes:

```bash
sudo kubeadm init \
  --kubernetes-version="$K8S_VERSION" \
  --apiserver-advertise-address="$CONTROL_PLANE_IP" \
  --skip-phases=addon/kube-proxy
```

Stop and notice:

```text
--skip-phases=addon/kube-proxy
```

A conventional kubeadm cluster normally installs kube-proxy.

We are deliberately leaving it out.

Eventually:

```text
Service
   |
   v
Cilium
   |
   v
eBPF
   |
   v
Pod
```

will replace the traditional:

```text
Service
   |
   v
kube-proxy
   |
   v
iptables / IPVS
   |
   v
Pod
```

Keep the `kubeadm join ...` command printed at the end.

We will use it shortly.

---

# C.10 Configure kubectl

`kubeadm init` created administrator credentials:

```text
/etc/kubernetes/admin.conf
```

Copy them:

```bash
mkdir -p "$HOME/.kube"

sudo cp \
  /etc/kubernetes/admin.conf \
  "$HOME/.kube/config"

sudo chown \
  "$(id -u):$(id -g)" \
  "$HOME/.kube/config"
```

Check:

```bash
kubectl cluster-info
```

Then:

```bash
kubectl get nodes
```

You should have something similar to:

```text
NAME          STATUS     ROLES           AGE   VERSION
k8s-control   NotReady   control-plane   ...   v1.35.x
```

Excellent.

Kubernetes exists.

It is not yet a working cluster.

---

# C.11 What kubeadm Created

Inspect system Pods:

```bash
kubectl get pods \
  -n kube-system \
  -o wide
```

Look for:

```text
etcd
kube-apiserver
kube-controller-manager
kube-scheduler
coredns
```

Now inspect the host:

```bash
sudo ls -l /etc/kubernetes/manifests
```

You should find:

```text
etcd.yaml
kube-apiserver.yaml
kube-controller-manager.yaml
kube-scheduler.yaml
```

These are **static Pods**.

```text
/etc/kubernetes/manifests
          |
          v
       kubelet
          |
          v
    static Pods
          |
    +-----+-----+----------+-----------+
    |           |          |           |
    v           v          v           v
 API server   etcd     scheduler   controller
```

No Deployment created them.

No ReplicaSet owns them.

The kubelet watches that directory.

Inspect the API server:

```bash
kubectl -n kube-system get pods \
  -l component=kube-apiserver
```

Then:

```bash
kubectl -n kube-system describe pod \
  "$(kubectl -n kube-system get pod \
      -l component=kube-apiserver \
      -o jsonpath='{.items[0].metadata.name}')"
```

The API contains a mirror Pod representing the static Pod managed by the node's kubelet.

---

# C.12 Why Is the Node NotReady?

Ask Kubernetes:

```bash
kubectl describe node k8s-control
```

Pay attention to:

```text
Conditions
Events
```

Check CoreDNS:

```bash
kubectl get pods \
  -n kube-system \
  -l k8s-app=kube-dns
```

It may still be:

```text
Pending
```

or otherwise unavailable.

Why?

We currently have:

```text
API server       ✓
etcd             ✓
scheduler        ✓
controller       ✓
kubelet          ✓
containerd       ✓

Pod network      ✗
```

`kubeadm` bootstraps Kubernetes.

It does not choose the cluster networking implementation for you.

---

# C.13 Prove kube-proxy Is Missing

Check:

```bash
kubectl get daemonsets \
  -n kube-system
```

Then explicitly:

```bash
kubectl get daemonset kube-proxy \
  -n kube-system
```

Expected:

```text
Error from server (NotFound)
```

That was intentional.

We are going to ask Cilium to provide the Kubernetes Service dataplane instead.

---

# C.14 Join the Worker

On:

```text
k8s-worker
```

run the join command printed by `kubeadm init`.

It will look similar to:

```bash
sudo kubeadm join 192.168.1.20:6443 \
  --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>
```

If you lost it, regenerate one on the control plane:

```bash
kubeadm token create \
  --print-join-command
```

Then run the returned command with `sudo` on the worker.

Back on the control plane:

```bash
kubectl get nodes
```

You should now see:

```text
NAME          STATUS     ROLES           VERSION
k8s-control   NotReady   control-plane   v1.35.x
k8s-worker    NotReady   <none>          v1.35.x
```

This is a useful state.

We have two Kubernetes nodes.

Neither has a working Pod network.

---

# C.15 Install the Cilium CLI

Run this on the control plane.

```bash
CILIUM_CLI_VERSION="$(
  curl -s \
  https://raw.githubusercontent.com/cilium/cilium-cli/main/stable.txt
)"

CLI_ARCH=amd64

if [ "$(uname -m)" = "aarch64" ]; then
  CLI_ARCH=arm64
fi
```

Download:

```bash
curl -L --fail --remote-name-all \
  "https://github.com/cilium/cilium-cli/releases/download/${CILIUM_CLI_VERSION}/cilium-linux-${CLI_ARCH}.tar.gz"{,.sha256sum}
```

Verify:

```bash
sha256sum --check \
  "cilium-linux-${CLI_ARCH}.tar.gz.sha256sum"
```

Install:

```bash
sudo tar xzvfC \
  "cilium-linux-${CLI_ARCH}.tar.gz" \
  /usr/local/bin
```

Cleanup:

```bash
rm "cilium-linux-${CLI_ARCH}.tar.gz"{,.sha256sum}
```

Check:

```bash
cilium version
```

---

# C.16 Install Cilium as the CNI and kube-proxy Replacement

Make sure the control-plane address is still available:

```bash
export CONTROL_PLANE_IP="$(
  kubectl get node k8s-control \
    -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}'
)"
```

Check:

```bash
echo "$CONTROL_PLANE_IP"
```

Install Cilium 1.20.1:

```bash
cilium install 1.20.1 \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost="$CONTROL_PLANE_IP" \
  --set k8sServicePort=6443
```

Why do we explicitly tell Cilium where the API server lives?

Normally Pods can reach the API server through the Kubernetes Service.

But:

```text
Kubernetes Service
       |
       v
Service dataplane
```

is exactly what we have not implemented yet.

There is no kube-proxy.

So Cilium needs the real API endpoint while it bootstraps the dataplane that will eventually implement Kubernetes Services.

Watch:

```bash
kubectl get pods \
  -n kube-system \
  -w
```

Eventually you should see Cilium agents and the operator running.

Stop with:

```text
Ctrl-C
```

---

# C.17 Watch the Cluster Become Ready

Check:

```bash
kubectl get nodes
```

We want:

```text
NAME          STATUS   ROLES           VERSION
k8s-control   Ready    control-plane   v1.35.x
k8s-worker    Ready    <none>          v1.35.x
```

What changed?

```text
Kubernetes exists
       |
       v
Nodes NotReady
       |
       | install Cilium
       v
CNI available
       |
       v
Pod networking available
       |
       v
Nodes Ready
```

Check Cilium:

```bash
cilium status --wait
```

Run the connectivity test:

```bash
cilium connectivity test
```

The test creates workloads and verifies the dataplane rather than merely checking whether Pods exist.

---

# C.18 Prove Cilium Replaced kube-proxy

Check again:

```bash
kubectl get daemonset kube-proxy \
  -n kube-system
```

It should still not exist.

Now ask Cilium:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg status \
  | grep KubeProxyReplacement
```

Expected:

```text
KubeProxyReplacement:   True
```

For more detail:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg status --verbose
```

Our cluster now looks more like:

```text
Kubernetes API
      |
      v
   Service
      |
      v
Cilium agent
      |
      v
 eBPF maps
      |
      v
   backend Pod
```

---

# C.19 Build a Workload

Return to familiar Kubernetes APIs.

Create:

```bash
kubectl create deployment web \
  --image=nginx:1.27-alpine \
  --replicas=2
```

Expose:

```bash
kubectl expose deployment web \
  --port=80
```

Observe:

```bash
kubectl get pods \
  -o wide
```

Then:

```bash
kubectl get service web
```

Create a client:

```bash
kubectl run client \
  --image=curlimages/curl \
  --restart=Never \
  --command -- \
  sleep 3600
```

Wait:

```bash
kubectl wait \
  --for=condition=Ready \
  pod/client \
  --timeout=90s
```

Call the Service:

```bash
kubectl exec client -- \
  curl -s http://web
```

You should receive the NGINX page.

There is still no kube-proxy.

Inspect Cilium's Service table:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg service list
```

Look for the ClusterIP belonging to:

```text
web
```

The object path is:

```text
Service
   |
   v
Kubernetes API
   |
   v
Cilium observes it
   |
   v
eBPF service state
   |
   v
backend Pods
```

The reconciliation model from the CKAD cookbook now reaches all the way into the network dataplane.

---

# C.20 Observe the kubelet

On the worker:

```bash
systemctl status kubelet --no-pager
```

Then:

```bash
journalctl -u kubelet \
  --since "10 minutes ago" \
  --no-pager
```

Remember:

```text
API server
    ^
    |
 kubelet
    |
    v
containerd
    |
    v
   Pods
```

The kubelet:

```text
registers the Node
watches assigned Pods
starts containers
mounts volumes
runs probes
reports status
```

It is the bridge between Kubernetes desired state and a Linux machine.

---

# C.21 Break It - Stop the kubelet

On:

```text
k8s-worker
```

stop the kubelet:

```bash
sudo systemctl stop kubelet
```

Back on the control plane:

```bash
kubectl get nodes -w
```

The node eventually stops reporting healthy status.

Inspect:

```bash
kubectl describe node k8s-worker
```

Now restore it:

```bash
sudo systemctl start kubelet
```

Watch again:

```bash
kubectl get nodes -w
```

Important:

```text
containerd may still have containers

but

kubelet is no longer reconciling the node
```

Stopping kubelet does not mean every process on the machine instantly disappears.

---

# C.22 Break It - Stop containerd

On the worker:

```bash
sudo systemctl stop containerd
```

Watch the kubelet:

```bash
journalctl -u kubelet -f
```

The dependency is:

```text
kubelet
   |
   | CRI
   v
containerd
```

No runtime means the kubelet cannot manage containers correctly.

Restore it:

```bash
sudo systemctl start containerd
sudo systemctl restart kubelet
```

Then:

```bash
kubectl get nodes
kubectl get pods -A
```

---

# C.23 Break It - Delete a Cilium Pod

Check:

```bash
kubectl get daemonset cilium \
  -n kube-system
```

List agents:

```bash
kubectl get pods \
  -n kube-system \
  -l k8s-app=cilium \
  -o wide
```

Delete one:

```bash
kubectl delete pod \
  -n kube-system \
  <cilium-pod-name>
```

Watch:

```bash
kubectl get pods \
  -n kube-system \
  -l k8s-app=cilium \
  -w
```

The DaemonSet controller notices the mismatch and replaces it.

```text
Delete agent
    |
    v
Desired != Actual
    |
    v
DaemonSet controller
    |
    v
Replacement agent
```

Same reconciliation model.

Lower in the stack.

---

# C.24 Break It - Remove the Scheduler

This is intentionally destructive.

Do it only in this disposable lab.

On `k8s-control`:

```bash
sudo mv \
  /etc/kubernetes/manifests/kube-scheduler.yaml \
  /tmp/kube-scheduler.yaml
```

Watch:

```bash
kubectl get pods \
  -n kube-system \
  -l component=kube-scheduler
```

Now create:

```bash
kubectl run no-scheduler \
  --image=nginx:1.27-alpine
```

Inspect:

```bash
kubectl get pod no-scheduler \
  -o wide
```

It should remain:

```text
Pending
```

Why?

```text
kubectl
   |
   v
API server
   |
   v
Pod object exists
   |
   X
scheduler
   |
   X
spec.nodeName
```

The API server can accept the object while another critical control-plane component is unavailable.

Restore:

```bash
sudo mv \
  /tmp/kube-scheduler.yaml \
  /etc/kubernetes/manifests/kube-scheduler.yaml
```

Watch:

```bash
kubectl get pod no-scheduler -w
```

Eventually:

```text
Pending -> Running
```

Cleanup:

```bash
kubectl delete pod no-scheduler
```

This is a useful distinction:

```text
API availability
```

is not the same as:

```text
complete cluster reconciliation
```

---

# C.25 Inspect a Scheduler Decision

Create:

```bash
kubectl run scheduled \
  --image=nginx:1.27-alpine
```

Query:

```bash
kubectl get pod scheduled \
  -o jsonpath='{.spec.nodeName}{"\n"}'
```

The path was:

```text
Pod submitted
     |
     v
API server
     |
     v
scheduler
     |
     | chooses node
     v
spec.nodeName
     |
     v
kubelet on chosen node
     |
     v
containerd
     |
     v
container
```

Cleanup:

```bash
kubectl delete pod scheduled
```

---

# C.26 Where etcd Fits

Inspect:

```bash
kubectl get pod \
  -n kube-system \
  -l component=etcd \
  -o wide
```

Normal API clients do not talk directly to etcd.

Think:

```text
kubectl
   |
   v
API server
   |
   v
etcd
```

Controllers also communicate through the API server.

The API server is the front door to cluster state.

That is why:

```text
Kubernetes is an API-driven control system
```

is more useful than:

```text
Kubernetes runs containers
```

---

# C.27 Single-Node Lab Option

If you only have one Linux machine, most of this appendix still works.

The control-plane node normally has a taint preventing ordinary workloads from being scheduled there.

Check:

```bash
kubectl describe node k8s-control \
  | grep -A5 Taints
```

For a disposable single-node lab:

```bash
kubectl taint nodes k8s-control \
  node-role.kubernetes.io/control-plane-
```

Now normal workloads may be scheduled there.

This is useful for learning.

It is not our preferred production topology.

---

# C.28 Drain and Uncordon a Node

Before maintenance:

```bash
kubectl drain k8s-worker \
  --ignore-daemonsets \
  --delete-emptydir-data
```

Check:

```bash
kubectl get nodes
```

The worker should show:

```text
SchedulingDisabled
```

Inspect workload placement:

```bash
kubectl get pods -o wide
```

Return it to service:

```bash
kubectl uncordon k8s-worker
```

Check:

```bash
kubectl get nodes
```

This is different from simply switching the server off.

You declared operational intent to Kubernetes first.

---

# C.29 Add Another Worker

Generate a new join command:

```bash
kubeadm token create \
  --print-join-command
```

Run it with `sudo` on another prepared worker.

Then:

```bash
kubectl get nodes
```

Cilium runs as a DaemonSet, so an agent will be scheduled onto the new node automatically.

Again:

```text
new Node
   |
   v
DaemonSet desired state changes
   |
   v
Cilium agent appears
```

---

# C.30 Reset a Worker

Drain it first:

```bash
kubectl drain k8s-worker \
  --ignore-daemonsets \
  --delete-emptydir-data \
  --force
```

On the worker:

```bash
sudo kubeadm reset -f
```

Remove CNI configuration left on disk:

```bash
sudo rm -rf /etc/cni/net.d
```

Back on the control plane:

```bash
kubectl delete node k8s-worker
```

Check:

```bash
kubectl get nodes
```

`kubeadm reset` is a best-effort reset.

It does not promise to return the operating system to its exact pre-Kubernetes state.

That is one reason disposable VMs make excellent learning environments.

---

# C.31 Reset the Whole Cluster

On each worker:

```bash
sudo kubeadm reset -f
sudo rm -rf /etc/cni/net.d
```

On the control plane:

```bash
sudo kubeadm reset -f
sudo rm -rf /etc/cni/net.d
```

Remove local kubectl credentials:

```bash
rm -rf "$HOME/.kube"
```

For a disposable lab, destroying and recreating the VMs is cleaner still.

That is not cheating.

Reproducible infrastructure is preferable to mysterious state.

---

# C.32 What kubeadm Did - and Did Not Do

kubeadm helped bootstrap:

```text
certificates
kubeconfigs
control-plane static Pods
etcd
bootstrap tokens
kubelet configuration
RBAC bootstrap
cluster configuration
```

It did **not** choose:

```text
our container runtime
our production topology
our CNI
our storage implementation
our Gateway implementation
our observability platform
our application workloads
```

`kubeadm` creates the Kubernetes foundation.

It does not create an entire application platform.

---

# C.33 The Whole Bootstrap Sequence

```text
Linux
  |
  v
containerd
  |
  | CRI
  v
kubelet
  |
  ^
  |
kubeadm
  |
  v
control plane
  |
  +--> API server
  +--> etcd
  +--> scheduler
  +--> controller-manager
  |
  v
Kubernetes exists
  |
  | but
  v
Nodes NotReady
  |
  | install
  v
Cilium
  |
  +--> CNI
  +--> eBPF dataplane
  +--> kube-proxy replacement
  |
  v
Nodes Ready
  |
  v
Pods / Services / Deployments
```

Compare that to:

```bash
kind create cluster
```

`kind` was not fake Kubernetes.

It was automating most of this journey for us.

---

# C.34 The Model to Remember

The CKAD cookbook started with:

```text
Desired state
     |
     v
Kubernetes API
     |
     v
Controller
     |
     v
Actual state
```

We can now expand it:

```text
                      desired state
                            |
                            v
                      Kubernetes API
                            |
               +------------+------------+
               |            |            |
               v            v            v
           scheduler    controllers    Cilium
               |            |            |
               +------------+------------+
                            |
                            v
                         kubelet
                            |
                            v
                        containerd
                            |
                            v
                      Linux kernel
                            |
                            v
                      actual state
```

Same Kubernetes model.

We simply followed it further down.

---

# C.35 Next - Cilium and Gateway API

Our cluster now has:

```text
Kubernetes 1.35
Cilium 1.20.1
kube-proxy replacement
```

That is exactly the substrate we want for:

```text
appendix-d-cilium-gateway-api.md
```

Next we will take:

```text
Service
NetworkPolicy
GatewayClass
Gateway
HTTPRoute
```

and follow them through:

```text
Kubernetes API
      |
      v
Cilium
      |
      v
eBPF / Envoy
      |
      v
actual traffic
```

That is where the application-facing Kubernetes API starts turning into a modern platform dataplane.

---

# Reference Versions

This appendix was written against:

```text
Kubernetes: 1.35
Cilium:     1.20.1
```

The Kubernetes 1.35 packages come from the versioned `pkgs.k8s.io` repository.

Cilium 1.20.1 officially supports Kubernetes 1.35.

Cilium's kube-proxy replacement documentation explicitly supports bootstrapping kubeadm with:

```text
--skip-phases=addon/kube-proxy
```

Always check the matching upstream documentation before using these instructions for a newer Kubernetes or Cilium release.
