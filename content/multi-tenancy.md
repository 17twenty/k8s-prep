# Appendix - From RBAC to Multi-Tenant Kubernetes [DEV] [DEEP DIVE]

This companion starts where the main cookbook's RBAC chapter stops.

The question is no longer only:

> What may this identity do inside Kubernetes?

It is now:

> What boundary should exist between tenants in the first place?

This is platform-engineering material, not CKAD material.

The goal is **not** to memorise product-specific commands. We will use ordinary RBAC, vCluster and Kamaji as hands-on experiments to make API, control-plane and worker isolation concrete.

By the end we will have built three different models:

```text
one shared API
    + namespace RBAC

separate tenant API
    + shared workers

separate tenant API
    + hosted control plane
    + independently joined workers
```

The vCluster lab assumes you are continuing from the cookbook's existing `kind-ckad` cluster. The Kamaji lab deliberately creates a second kind cluster so that experimentation does not disturb the CKAD environment.

---

# 1. Keep the Boundaries Separate

A useful tenancy model has several layers.

```text
Layer 1 - identity and API authorization
----------------------------------------
authentication
RBAC
admission

"Can Alice perform this API operation?"


Layer 2 - API / control-plane isolation
---------------------------------------
shared kube-apiserver
or
separate tenant kube-apiservers

"Does Alice even share a Kubernetes API with Bob?"


Layer 3 - workload isolation
----------------------------
namespaces
Pod security
scheduler policy
taints / affinity
separate worker pools
runtime sandboxing

"Can their workloads interfere on compute?"


Layer 4 - network, storage and infrastructure isolation
-------------------------------------------------------
NetworkPolicy
CNI / VPC / VLAN / VRF
CSI and storage policy
VM boundaries
bare-metal allocation
cloud IAM

"What underlying infrastructure do tenants share?"


Layer 5 - provider management plane
-----------------------------------
management cluster
cluster lifecycle controllers
provisioning systems
hardware / cloud APIs

"Who is allowed to change the infrastructure itself?"
```

No single layer replaces all the others.

For example:

```text
separate API servers
      !=
separate kernels
```

```text
NoSchedule taint
      !=
authorization boundary
```

```text
Kubernetes cluster-admin
      !=
SSH root on the machine
```

We are going to prove those distinctions rather than only state them.

---

# 2. Lab Zero: One Shared Cluster + Namespace RBAC

Before adding virtual or hosted control planes, establish the baseline.

Make sure we are on the cookbook cluster:

```bash
kubectl config use-context kind-ckad
```

Save the provider/host context. We will use this later because vCluster changes our current context for us:

```bash
export HOST_CONTEXT=$(kubectl config current-context)
echo "$HOST_CONTEXT"
```

Expected:

```text
kind-ckad
```

Create a namespace for Alice:

```bash
kubectl create namespace shared-alice
```

Create a small developer Role:

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: developer
  namespace: shared-alice
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "services"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "create", "update", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: alice-developer
  namespace: shared-alice
subjects:
  - kind: User
    name: alice
    apiGroup: rbac.authorization.k8s.io
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: developer
EOF
```

Because our kind administrator may impersonate users, we can ask the API server what Alice would be allowed to do:

```bash
kubectl auth can-i get pods \
  --as=alice \
  -n shared-alice
```

Expected:

```text
yes
```

She may create a Deployment in her namespace:

```bash
kubectl auth can-i create deployments.apps \
  --as=alice \
  -n shared-alice
```

Expected:

```text
yes
```

But she cannot create arbitrary namespaces:

```bash
kubectl auth can-i create namespaces \
  --as=alice
```

Expected:

```text
no
```

Nor delete Nodes:

```bash
kubectl auth can-i delete nodes \
  --as=alice
```

Expected:

```text
no
```

The model is:

```text
Alice
  |
  v
same kube-apiserver as everyone else
  |
  v
RBAC
  |
  +-- shared-alice namespace    some access
  +-- cluster-scoped objects    mostly no access
  +-- other tenant namespaces   no access unless granted
```

This is a legitimate tenancy model for many internal platforms.

But Alice still talks to the **same Kubernetes API** as everybody else.

That is the limitation we will explore next.

---

# 3. Why Give a Tenant Another Kubernetes API?

Suppose Alice needs broad Kubernetes freedom.

Inside a normal shared cluster, this would be dangerous:

```text
Alice
  |
  v
cluster-admin
  |
  v
shared cluster
```

`cluster-admin` is intentionally enormous.

A platform provider often wants something different:

```text
Alice
  |
  v
Alice's Kubernetes API
  |
  | cluster-admin is okay HERE
  v
Alice's tenant cluster


provider
  |
  v
provider Kubernetes API
  |
  | Alice does NOT get these credentials
  v
provider infrastructure
```

This changes the question from:

> How carefully can I restrict Alice inside my cluster?

into:

> Why should Alice be an administrator of my cluster at all?

That distinction is central to virtual clusters, hosted control planes and many managed Kubernetes systems.

---

# 4. Lab: Give Alice a vCluster

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

---

# 5. Alice Can Be an Administrator of Her Cluster

By default, the kubeconfig generated by `vcluster connect` uses tenant administrator credentials.

Prove what our current credential can do:

```bash
kubectl auth can-i create namespaces
```

Expected:

```text
yes
```

Try another cluster-scoped operation:

```bash
kubectl auth can-i create clusterrolebindings.rbac.authorization.k8s.io
```

Expected:

```text
yes
```

Make the permission set explicit:

```bash
kubectl auth can-i '*' '*'
```

With tenant administrator credentials this should report:

```text
yes
```

Now compare that with Alice against the **provider API**:

```bash
kubectl --context "$HOST_CONTEXT" \
  auth can-i delete nodes \
  --as=alice
```

Expected:

```text
no
```

This is the important model:

```text
              TENANT API

Alice's tenant credential
        |
        v
  tenant cluster-admin
        |
        v
      YES


             PROVIDER API

Alice
  |
  v
provider RBAC
  |
  +-- delete Nodes?                NO
  +-- create ClusterRoleBinding?   NO
```

`cluster-admin` is not a magical global property attached to a human being.

It is authorization **against a particular Kubernetes API**.

> In this lab we use vCluster-generated credentials and Kubernetes impersonation to make the boundary obvious. A production platform might authenticate the same human through OIDC or another identity provider on both APIs and assign different authorization in each one.

---

# 6. Issue a Less Powerful Tenant Credential

A tenant does not need to give every user administrator access either.

vCluster can generate a kubeconfig backed by a ServiceAccount and bind that ServiceAccount to a tenant-local ClusterRole.

Create/connect using a read-only tenant identity:

```bash
vcluster connect alice \
  --namespace tenant-alice \
  --service-account kube-system/alice-viewer \
  --cluster-role view
```

Now test it:

```bash
kubectl auth can-i get pods --all-namespaces
```

Expected:

```text
yes
```

But:

```bash
kubectl auth can-i create namespaces
```

Expected:

```text
no
```

And:

```bash
kubectl auth can-i create deployments.apps
```

Expected:

```text
no
```

So there are now **two authorization domains** in play:

```text
provider API
    |
    +-- provider decides who may manage vCluster infrastructure

Alice tenant API
    |
    +-- tenant decides who is admin, viewer, developer, etc.
```

Reconnect with the default tenant administrator credential for the next exercise:

```bash
vcluster connect alice \
  --namespace tenant-alice
```

---

# 7. Create a Workload Inside the Tenant

Create another namespace from inside Alice's cluster:

```bash
kubectl create namespace apps
```

Deploy nginx:

```bash
kubectl create deployment web \
  --image=nginx:1.27-alpine \
  -n apps
```

Watch it:

```bash
kubectl get pods \
  -n apps \
  -o wide
```

From Alice's perspective this is just Kubernetes:

```text
Alice
  |
  v
POST Deployment to tenant API
  |
  v
Deployment controller
  |
  v
ReplicaSet
  |
  v
Pod
```

But shared-node vCluster has another layer underneath.

Let's look behind the curtain.

---

# 8. Look at the Same Workload From the Provider Side

Disconnect from the tenant:

```bash
vcluster disconnect
```

If necessary, explicitly restore the host context:

```bash
kubectl config use-context "$HOST_CONTEXT"
```

Inspect the namespace where the vCluster lives:

```bash
kubectl get pods \
  -n tenant-alice \
  -o wide
```

You should see the tenant control-plane Pod and translated workloads.

A workload created inside the tenant might appear with a rewritten host-side name similar to:

```text
web-xxxxxxxxxx-yyyyy-x-apps-x-alice
```

The exact generated name is not important.

The important relationship is:

```text
TENANT VIEW
-----------
namespace: apps
pod:       web-xxxxx

        |
        | sync / translation
        v

PROVIDER VIEW
-------------
namespace: tenant-alice
pod:       rewritten host-side name
```

In shared-node mode, the vCluster syncer translates workload resources onto the provider cluster so the provider scheduler and kubelets can run them.

The tenant does not need credentials for that provider API.

---

# 9. Follow One Pod Through the vCluster Boundary

Reconnect:

```bash
vcluster connect alice \
  --namespace tenant-alice
```

Look at the tenant Pod:

```bash
kubectl get pods \
  -n apps \
  -o wide
```

Switch back to the host:

```bash
vcluster disconnect
kubectl config use-context "$HOST_CONTEXT"
```

Then:

```bash
kubectl get pods \
  -n tenant-alice \
  -o wide
```

You have just observed the complete path:

```text
kubectl
   |
   v
Alice tenant kube-apiserver
   |
   v
tenant Pod object
   |
   v
vCluster syncer
   |
   v
provider kube-apiserver
   |
   v
translated Pod
   |
   v
provider scheduler
   |
   v
provider node / kubelet
```

When the provider-side Pod changes status, vCluster synchronizes that observation back to the tenant API.

So even here we are still using the same control-loop model from Chapter 1:

```text
desired tenant object
       |
       v
translation / reconciliation
       |
       v
provider object
       |
       v
actual workload
       |
       v
status flows back
```

---

# 10. Shared API Isolation Is Not Worker Isolation

We have proven that Alice has a separate Kubernetes API.

But in this default shared-node model, her nginx workload ultimately runs on the same provider worker infrastructure as other workloads.

```text
Tenant A API         Tenant B API
     |                    |
     v                    v
 translated Pods     translated Pods
       \                  /
        \                /
         v              v
          provider nodes
                |
                v
           shared kernel
```

So:

```text
separate tenant API       yes
separate tenant RBAC      yes
separate host namespace   yes
separate physical node    not necessarily
separate kernel           no, not in shared-node mode
```

Current vCluster guidance treats shared nodes as appropriate for trusted tenants such as internal development, CI and testing.

It explicitly does **not** treat this model as the worker security boundary for untrusted external tenants with arbitrary Kubernetes workload access.

That is not a defect in RBAC.

It is a different layer of the architecture.

---

# 11. A Small Shared-Node Hardening Recipe

Even for trusted tenants, the provider should not assume the separate API is sufficient on its own.

For example, vCluster can create host-side NetworkPolicy around the tenant workload namespace:

```yaml
policies:
  networkPolicy:
    enabled: true
```

A more opinionated baseline can look like:

```yaml
policies:
  podSecurityStandard: restricted
  resourceQuota:
    enabled: true
  limitRange:
    enabled: true
  networkPolicy:
    enabled: true
    workload:
      publicEgress:
        enabled: false
sync:
  toHost:
    pods:
      useSecretsForSATokens: true
```

Save that as `vcluster-hardening.yaml`, then apply it as an upgrade:

```bash
vcluster create alice \
  --namespace tenant-alice \
  --upgrade \
  --connect=false \
  -f vcluster-hardening.yaml
```

But do **not** confuse configuration with enforcement.

```text
NetworkPolicy object exists
       !=
CNI actually enforces NetworkPolicy
```

The host CNI must implement the policy.

Likewise:

```text
Pod Security Standard
       !=
separate kernel
```

```text
resource quota
       !=
strong workload isolation
```

Hardening improves the shared-node model. It does not change its fundamental trust boundary.

> `restricted` Pod Security may also break workloads that assume root privileges. Treat that as useful feedback about the workload rather than blindly weakening the platform baseline.

---

# 12. What Would vCluster Private Nodes Change?

vCluster also supports a model where tenant workers are not shared with the provider worker pool.

This requires vCluster Platform and separate Linux worker machines, so it is not part of our simple `kind-ckad` lab.

The configuration begins with something like:

```yaml
privateNodes:
  enabled: true
  vpn:
    enabled: true
networking:
  podCIDR: 10.64.0.0/16
  serviceCIDR: 10.128.0.0/16
```

A private-node tenant cluster is created with:

```bash
vcluster create alice-private \
  --namespace tenant-alice-private \
  --values vcluster-private.yaml
```

An interesting thing happens immediately:

```bash
kubectl get nodes
```

Expected before joining any workers:

```text
No resources found.
```

That is not a broken cluster.

```text
control plane exists
       !=
worker nodes exist
```

Once private workers are joined:

```text
Alice tenant API
      |
      v
Alice private workers

Bob tenant API
      |
      v
Bob private workers
```

The provider-hosted control plane and tenant compute have become separate choices.

---

# 13. Clean Up the vCluster Lab

Before moving to Kamaji, delete Alice's vCluster:

```bash
kubectl config use-context "$HOST_CONTEXT"
```

```bash
vcluster delete alice \
  --namespace tenant-alice
```

Remove the baseline namespace too:

```bash
kubectl delete namespace shared-alice
```

Our original CKAD cluster remains intact.

---

# 14. Kamaji: Host the Tenant Control Plane, Not Its Workers

Kamaji approaches the broad problem differently.

Instead of every tenant owning dedicated control-plane VMs, Kamaji runs upstream Kubernetes control-plane components as workloads inside a provider-operated **Management Cluster**.

```text
                      Management Cluster

                        Kamaji operator
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
      Tenant A control plane            Tenant B control plane
      kube-apiserver                    kube-apiserver
      controller-manager                controller-manager
      scheduler                         scheduler
             |                                 |
             v                                 v
      tenant A API endpoint              tenant B API endpoint
             |                                 |
             v                                 v
      tenant A workers                   tenant B workers
```

This creates a clean separation:

```text
control-plane lifecycle
        |
        v
provider management cluster

worker lifecycle
        |
        v
VMs / bare metal / Cluster API / other provisioning
```

Let's build one.

---

# 15. Lab: Create a Kamaji Management Cluster on kind

Kamaji's official kind walkthrough is intended for development and learning only.

We will create a **separate** kind cluster named `kamaji`.

Prerequisites:

```text
docker
kind
kubectl
helm
jq
```

Create the management cluster:

```bash
kind create cluster --name kamaji
```

Verify:

```bash
kubectl config current-context
```

Expected:

```text
kind-kamaji
```

Save the context:

```bash
export KAMAJI_CONTEXT=$(kubectl config current-context)
```

---

# 16. Install cert-manager

Kamaji uses admission webhooks and relies on cert-manager for their TLS certificates.

Add the repository:

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
```

Install cert-manager:

```bash
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.18.3 \
  --set crds.enabled=true
```

Watch it become ready:

```bash
kubectl get pods \
  -n cert-manager \
  -w
```

Press `Ctrl-C` once the Pods are Ready.

> The pinned version above follows the current Kamaji kind walkthrough when this appendix was written. If upstream moves on, prefer the dependency versions in the current official guide.

---

# 17. Install MetalLB for Tenant API Endpoints

A Kamaji Tenant Control Plane needs an API endpoint.

In this kind lab, the official walkthrough uses MetalLB to provide LoadBalancer addresses on the Docker `kind` network.

Install MetalLB:

```bash
kubectl apply -f \
  https://raw.githubusercontent.com/metallb/metallb/v0.15.3/config/manifests/metallb-native.yaml
```

Wait for its controller:

```bash
kubectl wait \
  --namespace metallb-system \
  --for=condition=Available \
  deployment/controller \
  --timeout=120s
```

Get the IPv4 gateway of the Docker `kind` network:

```bash
GW_IP=$(docker network inspect kind \
  | jq -r '.[0].IPAM.Config[] | select(.Gateway | test("^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$")) | .Gateway')

echo "$GW_IP"
```

Derive the first two octets:

```bash
NET_IP=$(echo "$GW_IP" \
  | sed -E 's|^([0-9]+\.[0-9]+)\..*$|\1|g')

echo "$NET_IP"
```

Create an address pool near the top of that Docker subnet:

```bash
cat <<EOF | sed -E "s|172.19|${NET_IP}|g" | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: kind-ip-pool
  namespace: metallb-system
spec:
  addresses:
    - 172.19.255.200-172.19.255.250
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: kind-l2
  namespace: metallb-system
EOF
```

This is lab networking, not a production LoadBalancer design.

---

# 18. Install Kamaji

Add the Clastix chart repository:

```bash
helm repo add clastix https://clastix.github.io/charts
helm repo update
```

Install Kamaji:

```bash
helm upgrade --install kamaji clastix/kamaji \
  --namespace kamaji-system \
  --create-namespace \
  --set 'resources=null' \
  --version 0.0.0+latest
```

Watch the installation:

```bash
kubectl get pods \
  -n kamaji-system \
  -w
```

Then verify that Kamaji extended the Kubernetes API:

```bash
kubectl get crds \
  | grep -i kamaji
```

This should already look familiar:

```text
install operator
      |
      v
new CRD appears
      |
      v
new declarative API available
```

---

# 19. Create a TenantControlPlane

Apply Kamaji's current sample TenantControlPlane:

```bash
kubectl apply -f \
  https://raw.githubusercontent.com/clastix/kamaji/master/config/samples/kamaji_v1alpha1_tenantcontrolplane.yaml
```

Watch it reconcile:

```bash
kubectl get tcp -w
```

Eventually you should see a state similar to:

```text
NAME      VERSION   STATUS   CONTROL-PLANE ENDPOINT   KUBECONFIG
k8s-133   ...       Ready    ...:6443                 k8s-133-admin-kubeconfig
```

Stop the watch with `Ctrl-C`.

Inspect what Kamaji created in the **management cluster**:

```bash
kubectl get tcp,deploy,pods,svc
```

The conceptual chain is:

```text
TenantControlPlane
       |
       v
Kamaji controller
       |
       v
Deployment / Service / certificates / datastore state
       |
       v
running tenant kube-apiserver
       + controller-manager
       + scheduler
```

This is the same `spec -> controller -> status` model we began the entire cookbook with.

Kamaji is simply using it to create Kubernetes control planes.

---

# 20. Retrieve the Tenant kubeconfig

Kamaji writes the tenant administrator kubeconfig into a Secret named after the TenantControlPlane.

For the sample tenant:

```bash
kubectl get secret k8s-133-admin-kubeconfig
```

Extract it:

```bash
kubectl get secret k8s-133-admin-kubeconfig \
  -o jsonpath='{.data.admin\.conf}' \
  | base64 -d \
  > /tmp/kamaji-tenant.conf
```

Inspect its target without changing your main kubeconfig:

```bash
kubectl --kubeconfig=/tmp/kamaji-tenant.conf \
  config view --minify
```

We now have separate credentials for separate APIs:

```text
~/.kube/config
    -> provider / management clusters

/tmp/kamaji-tenant.conf
    -> tenant Kubernetes API
```

---

# 21. Talk Directly to the Tenant API

Try:

```bash
kubectl --kubeconfig=/tmp/kamaji-tenant.conf \
  cluster-info
```

Then:

```bash
kubectl --kubeconfig=/tmp/kamaji-tenant.conf \
  get namespaces
```

Now the important command:

```bash
kubectl --kubeconfig=/tmp/kamaji-tenant.conf \
  get nodes
```

Expected:

```text
No resources found.
```

This is not an error.

We successfully have:

```text
kube-apiserver          yes
controller-manager      yes
scheduler               yes
Kubernetes API          yes
worker node             no
```

That gives us a clean mental model:

```text
control plane exists
        !=
compute exists
```

The tenant has a Kubernetes cluster control plane before it has somewhere to run application Pods.

---

# 22. macOS / Docker Desktop Note

On native Linux, the MetalLB address on the Docker `kind` network is often directly reachable from the host.

On macOS with Docker Desktop, the Docker bridge network may not be routed directly into macOS.

That means this can happen:

```text
TenantControlPlane     Ready
LoadBalancer IP        allocated
kubeconfig             valid

but

kubectl from macOS     cannot route to that Docker-network IP
```

Do not interpret that as Kamaji reconciliation failing.

First confirm from the management side:

```bash
kubectl --context "$KAMAJI_CONTEXT" get tcp
```

and:

```bash
kubectl --context "$KAMAJI_CONTEXT" get svc
```

The official Kamaji kind guide calls out this Docker bridge/macOS case and suggests running tenant API checks from an environment that can reach the kind Docker network, including the kind control-plane container when appropriate.

The networking lesson is useful in its own right:

```text
API exists
   !=
my current machine has a route to that API
```

Production Kamaji environments expose the API deliberately with normal LoadBalancer, DNS, Gateway or equivalent networking rather than relying on Docker Desktop bridge routing.

---

# 23. What Would Joining a Worker Look Like?

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

---

# 24. The Provider Does Not Need to Give Away Its Management Cluster

Return to the original access-control question.

A tenant can receive:

```text
/tmp/kamaji-tenant.conf
```

which grants access to:

```text
Tenant A kube-apiserver
```

without receiving credentials for:

```text
kind-kamaji management API
```

and without receiving:

```text
SSH access to the management hosts
```

Those are different trust boundaries:

```text
                     TENANT
                        |
                        v
                 Tenant API endpoint
                        |
                        v
               tenant Kubernetes RBAC

================================================
                  provider boundary
================================================

               Management Cluster API
                        |
               Kamaji / controllers
                        |
                host infrastructure
```

The tenant may be `cluster-admin` above the line.

That does not imply they are administrator below it.

---

# 25. vCluster and Kamaji: Compare What We Actually Built

We have now used both models instead of only drawing them.

| Question | Shared namespace + RBAC | vCluster shared nodes | Kamaji |
|---|---|---|---|
| Tenant has separate kube-apiserver | No | Yes | Yes |
| Tenant-local RBAC | No separate API | Yes | Yes |
| Tenant can have broad admin without provider-cluster admin | Not as shared `cluster-admin` | Yes | Yes |
| Provider hosts tenant control plane | Shared provider CP | Yes | Yes |
| Tenant workload becomes a Pod on provider cluster | Directly | Yes, translated/synced | No - worker joins tenant API |
| Workers can be shared | Yes | Yes | Not the core model |
| Dedicated workers possible | By platform design | Yes, private nodes | Yes |
| Worker lifecycle bundled into basic control-plane creation | N/A | Depends on worker model | No |
| Provider management credentials required by tenant | Same shared API | No | No |

The important difference is not which product has the longest feature list.

It is **where each architecture places the boundary**.

---

# 26. Revisit the Control-Plane Node Question

The original question was roughly:

> How do I let users operate Kubernetes without letting them control the control-plane nodes?

There were actually four questions hiding inside it.

## 26.1 May Alice modify the Node API object?

That is Kubernetes authorization:

```bash
kubectl auth can-i delete nodes \
  --as=alice
```

RBAC answers this.

## 26.2 May Alice's Pod run on a particular node?

That is scheduling and admission policy:

```text
nodeSelector
affinity
taints / tolerations
admission
```

A control-plane `NoSchedule` taint is useful placement policy.

It is not a hard authorization boundary if Alice is allowed to submit arbitrary tolerations.

## 26.3 May Alice log into the machine?

That is infrastructure access:

```text
cloud IAM
SSH keys
VPN / firewall
bastions
OS users
```

Kubernetes RBAC does not remove Alice's SSH key.

## 26.4 Does Alice need to see the provider API at all?

That is the architectural question we explored here:

```text
shared cluster
    |
    +-- Alice and provider use same API

versus

tenant control plane
    |
    +-- Alice uses tenant API
    +-- provider API remains provider-only
```

This fourth option can dramatically reduce how much permission engineering has to happen inside the provider cluster.

---

# 27. Strong Tenancy Is Still a Stack

Even a separate tenant kube-apiserver does not solve every problem.

For an untrusted external tenant, a design may need something closer to:

```text
Tenant identity
    |
    v
Tenant API server
    |
    +-- tenant-local RBAC
    +-- admission / policy
    |
    v
Dedicated or strongly isolated compute
    |
    +-- runtime security
    +-- device isolation
    |
    v
Tenant network boundary
    |
    +-- NetworkPolicy
    +-- VPC / VLAN / routing policy
    |
    v
Tenant storage boundary
    |
    +-- CSI / volume policy
    +-- encryption / credentials
    |
    v
Provider management plane
    |
    X tenant credentials do not cross this boundary
```

Do not collapse those controls into one mental bucket.

```text
RBAC
  != NetworkPolicy
  != scheduler placement
  != node isolation
  != VM isolation
  != storage isolation
  != host IAM
```

---

# 28. A Practical Platform Decision Sequence

When designing a platform, ask these questions in order.

```text
1. Are the tenants mutually trusted?
        |
        +-- yes -> shared cluster + namespace/RBAC may be sufficient
        |
        +-- no  -> continue

2. Do tenants need broad Kubernetes administration?
        |
        +-- yes -> consider separate tenant API/control-plane boundaries

3. Can tenants execute arbitrary workloads?
        |
        +-- yes -> decide what worker/kernel isolation is required

4. Can workloads communicate across tenants?
        |
        +-- no -> enforce network boundaries

5. Can storage or devices be shared safely?
        |
        +-- design CSI/device/IOMMU/etc. boundaries accordingly

6. Can tenant credentials reach the provider management plane?
        |
        +-- they generally should not
```

Then pick technology.

Do not begin with:

```text
"We should use vCluster."
```

Begin with:

```text
"What boundary are we trying to create?"
```

---

# 29. Connect This Back to the Main Cookbook

Nearly everything in this appendix is built from concepts we already learned.

```text
Authentication / RBAC
    -> Chapter 23

SecurityContext / Pod security
    -> Chapter 24

NetworkPolicy
    -> Chapter 25

Taints / scheduling eligibility
    -> scheduling chapters

CRDs
    -> Chapter 33

Controllers
    -> Chapter 34

spec / status / reconciliation
    -> Chapter 1 and everywhere else
```

The platform gets more sophisticated.

The primitive stays familiar:

```text
API object
   |
   v
desired state
   |
   v
controller
   |
   v
lower-level infrastructure
   |
   v
status
```

A `Deployment` reconciles Pods.

A vCluster syncer reconciles tenant resources into provider resources.

Kamaji reconciles a `TenantControlPlane` into a running Kubernetes control plane.

Cluster API can reconcile a cluster specification into worker machines.

Once the control-loop model is clear, these systems stop looking magical.

---

# 30. Cleanup the Kamaji Lab

When finished, return to the CKAD context:

```bash
kubectl config use-context kind-ckad
```

Delete the entire Kamaji learning environment:

```bash
kind delete cluster --name kamaji
```

Remove the temporary tenant kubeconfig:

```bash
rm -f /tmp/kamaji-tenant.conf
```

Your original cookbook cluster remains available.

---

# 31. What You Should Remember

If you retain only a few things from this appendix, make them these:

```text
RBAC answers:
"What can this identity do against this Kubernetes API?"
```

```text
A separate tenant API answers:
"Why should this tenant be an administrator of my provider API at all?"
```

```text
Separate API servers do not automatically mean separate workers or kernels.
```

```text
cluster-admin is relative to a cluster/API boundary.
```

```text
control plane exists != worker nodes exist
```

and:

```text
a strong tenant boundary is normally a stack of controls,
not one Kubernetes object or one product.
```

---

# 32. Official References

These projects evolve quickly. The commands and architecture above were aligned with their current documentation when this appendix was written; use current upstream docs when making a real platform decision.

## vCluster

- Shared Nodes Quick Start: https://www.vcluster.com/docs/vcluster/quick-start/shared-nodes
- Architecture: https://www.vcluster.com/docs/vcluster/introduction/architecture/
- Access and ServiceAccount kubeconfigs: https://www.vcluster.com/docs/vcluster/manage/accessing-vcluster
- Shared-node hardening: https://www.vcluster.com/docs/vcluster/security/shared-nodes-hardening
- Private Nodes Quick Start: https://www.vcluster.com/docs/vcluster/quick-start/private-nodes

## Kamaji

- Kamaji on kind: https://kamaji.clastix.io/getting-started/kamaji-kind/
- Tenant Control Plane concepts: https://kamaji.clastix.io/concepts/tenant-control-plane/
- Generic infrastructure / joining workers: https://kamaji.clastix.io/getting-started/kamaji-generic/
- API reference: https://kamaji.clastix.io/reference/api/
- Kubeconfig generation: https://kamaji.clastix.io/guides/kubeconfig-generator/

## Kubernetes

- Authentication: https://kubernetes.io/docs/reference/access-authn-authz/authentication/
- RBAC: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
- Authorization: https://kubernetes.io/docs/reference/access-authn-authz/authorization/
- NetworkPolicy: https://kubernetes.io/docs/concepts/services-networking/network-policies/
