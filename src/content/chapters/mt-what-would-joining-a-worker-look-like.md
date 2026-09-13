Kamaji deliberately does not create tenant worker machines for you.

Workers might come from:

```text
cloud VMs
bare metal
Cluster API
an infrastructure platform
manual provisioning
```

Once a Linux machine has the required container runtime, kubelet and kubeadm components installed, the tenant control plane can generate an ordinary kubeadm join command.

Conceptually:

```bash
kubeadm --kubeconfig=/tmp/kamaji-tenant.conf \
  token create \
  --print-join-command
```

That produces the familiar shape:

```text
kubeadm join <tenant-api>:6443 \
  --token ... \
  --discovery-token-ca-cert-hash ...
```

Run that command on the intended worker machine.

Then:

```bash
kubectl --kubeconfig=/tmp/kamaji-tenant.conf \
  get nodes
```

would move from:

```text
No resources found.
```

towards something like:

```text
NAME        STATUS   ROLES    AGE
worker-01   Ready    <none>   30s
```

The architecture is therefore:

```text
Kamaji management cluster
       |
       +-- tenant kube-apiserver
       +-- tenant controller-manager
       +-- tenant scheduler

                 |
                 | Kubernetes API
                 v

        independently provisioned
             worker nodes
```

Kamaji can also integrate with Cluster API so that worker lifecycle becomes declarative rather than a manual `kubeadm join` exercise.
