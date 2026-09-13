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
