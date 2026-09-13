vCluster gives a tenant its own Kubernetes API while allowing the platform operator to host the tenant control plane on existing infrastructure.

We will begin with its shared-node model because we can run the whole experiment on our existing kind cluster.

## 4.1 Install the vCluster CLI

On macOS with Homebrew:

```bash
brew install loft-sh/tap/vcluster
```

Verify it:

```bash
vcluster --version
```

Make sure the host context is still our cookbook cluster:

```bash
kubectl config use-context "$HOST_CONTEXT"
```

## 4.2 Create Alice's tenant cluster

Create a tenant cluster called `alice` inside the provider namespace `tenant-alice`:

```bash
vcluster create alice \
  --namespace tenant-alice
```

The vCluster CLI automatically connects you to the new tenant cluster when creation completes.

Check the current context:

```bash
kubectl config current-context
```

Then ask the API server what namespaces exist:

```bash
kubectl get namespaces
```

You should see an ordinary Kubernetes-looking namespace view such as:

```text
default
kube-node-lease
kube-public
kube-system
```

Alice is **not** looking at the provider cluster's namespace list.

She is talking to another Kubernetes API.

Conceptually:

```text
                         kind-ckad
                    provider Kubernetes
                           API
                            |
                            v
                     tenant-alice
                            |
                      vCluster CP
                    + API server
                    + controllers
                    + datastore
                    + syncer
                            |
                            v
                          Alice
```
