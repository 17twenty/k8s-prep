# Appendix D - Cilium, eBPF and Gateway API

A runnable networking deep dive for the Kubernetes cookbook.

This appendix assumes you completed:

```text
appendix-c-kubeadm.md
```

Target versions:

```text
Cilium:      1.20.1
Gateway API: 1.6.1
Kubernetes:  1.35
```

---

# D.1 What We Are Adding

Our cluster currently looks roughly like:

```text
Application
    |
    v
Kubernetes API
    |
    +--> Deployment controller
    |
    +--> Service objects
    |
    +--> NetworkPolicy
    |
    v
Cilium
    |
    +--> CNI
    |
    +--> NetworkPolicy enforcement
    |
    +--> kube-proxy replacement
    |
    v
eBPF dataplane
```

We are going to add L7 routing:

```text
Client
  |
  v
Gateway
  |
  v
Cilium Gateway controller
  |
  v
Envoy
  |
  v
HTTPRoute
  |
  v
Service
  |
  v
Pod
```

Gateway API separates concerns more cleanly than the original Ingress model.

The important resource chain is:

```text
GatewayClass
     |
     v
Gateway
     |
     v
HTTPRoute
     |
     v
Service
     |
     v
Pod
```

---

# D.2 Why Gateway API

Ingress gives us roughly:

```text
Ingress
   |
   v
Controller
   |
   v
Service
```

Gateway API makes roles explicit.

```text
Platform owns
----------------
GatewayClass
Gateway


Application team owns
---------------------
HTTPRoute
Service
Deployment
```

Think:

```text
GatewayClass
   -> Which implementation handles this?

Gateway
   -> Where and how does traffic enter?

HTTPRoute
   -> Where should HTTP requests go?

Service
   -> Which backend Pods receive them?
```

That separation becomes particularly useful in shared clusters.

---

# D.3 Verify the Starting Cluster

Check nodes:

```bash
kubectl get nodes
```

Check Cilium:

```bash
cilium status --wait
```

Confirm kube-proxy is absent:

```bash
kubectl get daemonset kube-proxy \
  -n kube-system
```

Expected:

```text
Error from server (NotFound)
```

Confirm replacement mode:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg status \
  | grep KubeProxyReplacement
```

Expected:

```text
KubeProxyReplacement:   True
```

This matters because Cilium's Gateway API implementation requires kube-proxy replacement.

---

# D.4 Install the Gateway API CRDs

Gateway API is not built into Kubernetes core as a set of automatically available resources.

Install the Gateway API 1.6.1 standard channel:

```bash
kubectl apply --server-side \
  -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
```

Discover the new APIs:

```bash
kubectl api-resources \
  --api-group=gateway.networking.k8s.io
```

You should see resources including:

```text
gatewayclasses
gateways
httproutes
grpcroutes
referencegrants
```

Ask the API:

```bash
kubectl explain gateway
```

Then:

```bash
kubectl explain httproute.spec
```

This should feel familiar from the CKAD cookbook.

We installed new API types.

We have not yet proven that anything implements them.

---

# D.5 Enable Cilium's Gateway API Controller

A normal Cilium Gateway creates a Service of type:

```text
LoadBalancer
```

On a cloud cluster, the cloud load-balancer integration may give that Service an external address.

Our kubeadm lab deliberately has no cloud load balancer.

Rather than adding another product merely to make the exercise work, we will use Cilium's **Gateway host-network mode**.

That means:

```text
Gateway listener
      |
      v
Cilium Envoy
      |
      v
node network interface
```

Use ports above `1023` for this lab.

Find the API server address:

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

Upgrade the existing Cilium installation:

```bash
cilium upgrade 1.20.1 \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost="$CONTROL_PLANE_IP" \
  --set k8sServicePort=6443 \
  --set gatewayAPI.enabled=true \
  --set gatewayAPI.hostNetwork.enabled=true
```

Wait:

```bash
cilium status --wait
```

Inspect Cilium components:

```bash
kubectl get pods \
  -n kube-system \
  -o wide
```

Look for the Cilium agents, operator and Envoy components.

---

# D.6 Find the GatewayClass

Check:

```bash
kubectl get gatewayclass
```

You should see:

```text
cilium
```

Inspect:

```bash
kubectl describe gatewayclass cilium
```

The relationship is:

```text
GatewayClass/cilium
        |
        v
Cilium Gateway controller
```

`GatewayClass` is cluster-scoped.

It tells Kubernetes which implementation is responsible for Gateways using that class.

---

# D.7 Build Two Backend Versions

Create a namespace for this lab:

```bash
kubectl create namespace gateway-lab
```

Set it as the current default:

```bash
kubectl config set-context \
  --current \
  --namespace=gateway-lab
```

Create version one:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-v1
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-v1
  template:
    metadata:
      labels:
        app: api-v1
        version: v1
    spec:
      containers:
        - name: web
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              mkdir -p /www
              echo "hello from api-v1" > /www/index.html
              echo "allowed from api-v1" > /www/allowed
              echo "denied from api-v1" > /www/denied
              httpd -f -p 8080 -h /www
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: api-v1
spec:
  selector:
    app: api-v1
  ports:
    - port: 80
      targetPort: 8080
```

Save as:

```text
api-v1.yaml
```

Apply:

```bash
kubectl apply -f api-v1.yaml
```

Create version two:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-v2
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-v2
  template:
    metadata:
      labels:
        app: api-v2
        version: v2
    spec:
      containers:
        - name: web
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              mkdir -p /www
              echo "hello from api-v2" > /www/index.html
              httpd -f -p 8080 -h /www
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: api-v2
spec:
  selector:
    app: api-v2
  ports:
    - port: 80
      targetPort: 8080
```

Save as:

```text
api-v2.yaml
```

Apply:

```bash
kubectl apply -f api-v2.yaml
```

Check:

```bash
kubectl get deployments
kubectl get pods -o wide
kubectl get services
```

Before touching Gateway API, prove ordinary Kubernetes Services work.

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

Test:

```bash
kubectl exec client -- \
  curl -s http://api-v1
```

Expected:

```text
hello from api-v1
```

Then:

```bash
kubectl exec client -- \
  curl -s http://api-v2
```

Expected:

```text
hello from api-v2
```

We have now proved:

```text
Pods
  |
  v
Services
  |
  v
Cilium Service dataplane
```

works before adding L7 routing.

---

# D.8 Create a Gateway

Create:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: public
spec:
  gatewayClassName: cilium

  listeners:
    - name: http
      protocol: HTTP
      port: 8080
      hostname: api.example.test

      allowedRoutes:
        namespaces:
          from: Same
```

Save as:

```text
gateway.yaml
```

Apply:

```bash
kubectl apply -f gateway.yaml
```

Inspect:

```bash
kubectl get gateway public
```

Then:

```bash
kubectl describe gateway public
```

Look at:

```text
Status
Conditions
Addresses
Listeners
```

Query conditions:

```bash
kubectl get gateway public \
  -o jsonpath='{range .status.conditions[*]}{.type}={.status}{" reason="}{.reason}{"\n"}{end}'
```

We want conditions indicating the Gateway has been accepted and programmed.

The object path is:

```text
Gateway
   |
   v
Kubernetes API
   |
   v
Cilium Gateway controller
   |
   v
Envoy listener :8080
```

---

# D.9 Create an HTTPRoute

Create:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api
spec:

  parentRefs:
    - name: public

  hostnames:
    - api.example.test

  rules:
    - backendRefs:
        - name: api-v1
          port: 80
```

Save as:

```text
route.yaml
```

Apply:

```bash
kubectl apply -f route.yaml
```

Inspect:

```bash
kubectl get httproute api
```

Then:

```bash
kubectl describe httproute api
```

Query status:

```bash
kubectl get httproute api \
  -o jsonpath='{range .status.parents[*].conditions[*]}{.type}={.status}{" reason="}{.reason}{"\n"}{end}'
```

The complete chain is now:

```text
GatewayClass/cilium
        |
        v
Gateway/public
        |
        v
HTTPRoute/api
        |
        v
Service/api-v1
        |
        v
EndpointSlice
        |
        v
Pods
```

Notice how much of this is still ordinary Kubernetes API composition.

---

# D.10 Send Traffic Through the Gateway

Because we enabled host-network mode, the listener exists on the node network.

Find node addresses:

```bash
kubectl get nodes -o wide
```

Pick one reachable node IP:

```bash
export GATEWAY_NODE_IP="$(
  kubectl get node k8s-worker \
    -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}'
)"
```

If you are using a single-node lab, use `k8s-control` instead.

Check:

```bash
echo "$GATEWAY_NODE_IP"
```

Request:

```bash
curl \
  -H 'Host: api.example.test' \
  "http://${GATEWAY_NODE_IP}:8080/"
```

Expected:

```text
hello from api-v1
```

Try without the hostname:

```bash
curl \
  "http://${GATEWAY_NODE_IP}:8080/"
```

The result should not match our route in the same way.

Why?

Our HTTPRoute declares:

```text
api.example.test
```

Gateway API routing is based on declared listeners and route matches, not merely on a port being open.

---

# D.11 Observe the Resources Cilium Created

Start with Kubernetes:

```bash
kubectl get gateway
kubectl get httproute
kubectl get svc
```

Inspect Cilium:

```bash
cilium status
```

Inspect Envoy-related resources:

```bash
kubectl get ciliumenvoyconfigs \
  -A
```

Depending on Cilium's generated configuration and version, you should see resources representing L7 proxy configuration.

This is an important transition.

The application developer created:

```text
Gateway
HTTPRoute
```

The implementation created lower-level configuration needed to make those resources real.

Conceptually:

```text
HTTPRoute
    |
    v
Kubernetes API
    |
    v
Cilium controller
    |
    v
Envoy configuration
    |
    v
listener / routes / clusters
    |
    v
actual HTTP traffic
```

---

# D.12 Break It - Point at a Missing Backend

Patch the route:

```bash
kubectl patch httproute api \
  --type=json \
  -p='[
    {
      "op":"replace",
      "path":"/spec/rules/0/backendRefs/0/name",
      "value":"api-does-not-exist"
    }
  ]'
```

Inspect:

```bash
kubectl describe httproute api
```

Pay attention to route conditions.

You should see that the route cannot completely resolve its references.

Query:

```bash
kubectl get httproute api \
  -o jsonpath='{range .status.parents[*].conditions[*]}{.type}={.status}{" reason="}{.reason}{" message="}{.message}{"\n"}{end}'
```

Try traffic:

```bash
curl \
  -H 'Host: api.example.test' \
  "http://${GATEWAY_NODE_IP}:8080/"
```

Do not start debugging at Envoy.

Start at the API:

```text
Gateway
   |
   v
HTTPRoute
   |
   v
backendRef
   |
   X
Service missing
```

Fix it:

```bash
kubectl patch httproute api \
  --type=json \
  -p='[
    {
      "op":"replace",
      "path":"/spec/rules/0/backendRefs/0/name",
      "value":"api-v1"
    }
  ]'
```

Wait a moment and inspect again:

```bash
kubectl describe httproute api
```

Then:

```bash
curl \
  -H 'Host: api.example.test' \
  "http://${GATEWAY_NODE_IP}:8080/"
```

Expected:

```text
hello from api-v1
```

Status is part of the API contract.

Use it.

---

# D.13 Header-Based Routing

Replace the HTTPRoute with:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api
spec:

  parentRefs:
    - name: public

  hostnames:
    - api.example.test

  rules:

    - matches:
        - headers:
            - name: x-api-version
              value: v2
      backendRefs:
        - name: api-v2
          port: 80

    - backendRefs:
        - name: api-v1
          port: 80
```

Apply:

```bash
kubectl apply -f route.yaml
```

Default request:

```bash
curl \
  -H 'Host: api.example.test' \
  "http://${GATEWAY_NODE_IP}:8080/"
```

Expected:

```text
hello from api-v1
```

Version-two request:

```bash
curl \
  -H 'Host: api.example.test' \
  -H 'x-api-version: v2' \
  "http://${GATEWAY_NODE_IP}:8080/"
```

Expected:

```text
hello from api-v2
```

Now the routing decision is:

```text
Request
   |
   +-- x-api-version=v2 --> api-v2
   |
   +-- otherwise --------> api-v1
```

This is well beyond what a Kubernetes Service selector can express.

---

# D.14 Weighted Backends - A Simple Canary

Replace the route rules with:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api
spec:

  parentRefs:
    - name: public

  hostnames:
    - api.example.test

  rules:
    - backendRefs:

        - name: api-v1
          port: 80
          weight: 90

        - name: api-v2
          port: 80
          weight: 10
```

Apply:

```bash
kubectl apply -f route.yaml
```

Send several requests:

```bash
for i in $(seq 1 30); do
  curl -s \
    -H 'Host: api.example.test' \
    "http://${GATEWAY_NODE_IP}:8080/"
done | sort | uniq -c
```

You should see requests reaching both versions.

Do not expect exactly 90/10 over a tiny sample.

The important difference from the simple canary in the CKAD cookbook is:

```text
Old approach
------------

9 Pods stable
1 Pod canary

Service selects all 10


Gateway API approach
--------------------

HTTPRoute
  |
  +-- weight 90 -> Service v1
  |
  +-- weight 10 -> Service v2
```

The routing intent is now explicit in the API.

---

# D.15 Return to a Single Backend

Restore:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api
spec:
  parentRefs:
    - name: public
  hostnames:
    - api.example.test
  rules:
    - backendRefs:
        - name: api-v1
          port: 80
```

Apply:

```bash
kubectl apply -f route.yaml
```

---

# D.16 Cross-Namespace Backends and ReferenceGrant

Gateway API deliberately makes cross-namespace references explicit.

Create another namespace:

```bash
kubectl create namespace payments
```

Create a backend there:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments
  namespace: payments
spec:
  replicas: 1
  selector:
    matchLabels:
      app: payments
  template:
    metadata:
      labels:
        app: payments
    spec:
      containers:
        - name: web
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              mkdir -p /www
              echo "hello from payments" > /www/index.html
              httpd -f -p 8080 -h /www
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: payments
  namespace: payments
spec:
  selector:
    app: payments
  ports:
    - port: 80
      targetPort: 8080
```

Save as:

```text
payments.yaml
```

Apply:

```bash
kubectl apply -f payments.yaml
```

Now point our route at it:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api
  namespace: gateway-lab
spec:

  parentRefs:
    - name: public

  hostnames:
    - api.example.test

  rules:
    - backendRefs:
        - name: payments
          namespace: payments
          port: 80
```

Apply:

```bash
kubectl apply -f route.yaml
```

Inspect:

```bash
kubectl describe httproute api
```

The reference should not be considered valid merely because the Service exists.

Why?

The route lives in:

```text
gateway-lab
```

but wants to reference a Service in:

```text
payments
```

Gateway API requires the target namespace to explicitly permit that reference.

Create:

```yaml
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-gateway-lab
  namespace: payments
spec:

  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: gateway-lab

  to:
    - group: ""
      kind: Service
      name: payments
```

Save as:

```text
referencegrant.yaml
```

Apply:

```bash
kubectl apply -f referencegrant.yaml
```

Inspect the route again:

```bash
kubectl describe httproute api
```

Then test:

```bash
curl \
  -H 'Host: api.example.test' \
  "http://${GATEWAY_NODE_IP}:8080/"
```

Expected:

```text
hello from payments
```

The security boundary is:

```text
gateway-lab HTTPRoute
        |
        | asks to reference
        v
payments/Service
        |
        X
not allowed by default
        |
        v
ReferenceGrant in payments
        |
        v
reference accepted
```

The target namespace owns the permission.

That is a powerful multi-team platform primitive.

---

# D.17 Restore the Local Backend

Restore `route.yaml`:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api
  namespace: gateway-lab
spec:
  parentRefs:
    - name: public
  hostnames:
    - api.example.test
  rules:
    - backendRefs:
        - name: api-v1
          port: 80
```

Apply:

```bash
kubectl apply -f route.yaml
```

---

# D.18 Look at Cilium Identities

List Cilium endpoints:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg endpoint list
```

Look at identities:

```bash
kubectl get ciliumidentities
```

Cilium does not need to think only in terms of transient Pod IP addresses.

It associates workloads with identities derived from labels.

Conceptually:

```text
Pod labels
    |
    v
Cilium identity
    |
    v
policy / dataplane decisions
```

That becomes particularly useful when Pods are recreated and their IP addresses change.

The workload identity can remain logically stable even while endpoints change.

---

# D.19 Inspect the eBPF Service Dataplane

List Cilium services:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg service list
```

List the underlying BPF load-balancer state:

```bash
kubectl -n kube-system exec ds/cilium -- \
  cilium-dbg bpf lb list
```

Compare with:

```bash
kubectl get services -A
```

and:

```bash
kubectl get endpointslices -A
```

The layers are:

```text
Kubernetes Service
      |
      v
EndpointSlices
      |
      v
Cilium observes API state
      |
      v
BPF maps
      |
      v
packet forwarding
```

The important idea is not to memorise BPF map output.

It is to understand that the high-level API is compiled into lower-level dataplane state.

---

# D.20 Standard NetworkPolicy Still Matters

Cilium does not require applications to use Cilium-specific policy objects.

The normal Kubernetes API still works:

```text
networking.k8s.io/v1
NetworkPolicy
```

Create another in-cluster client:

```bash
kubectl run restricted-client \
  --image=curlimages/curl \
  --labels=role=client \
  --restart=Never \
  --command -- \
  sleep 3600
```

Wait:

```bash
kubectl wait \
  --for=condition=Ready \
  pod/restricted-client \
  --timeout=90s
```

Baseline:

```bash
kubectl exec restricted-client -- \
  curl -s http://api-v1
```

Create default deny for `api-v1`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-v1-deny
spec:
  podSelector:
    matchLabels:
      app: api-v1
  policyTypes:
    - Ingress
```

Save as:

```text
networkpolicy-deny.yaml
```

Apply:

```bash
kubectl apply -f networkpolicy-deny.yaml
```

Retry:

```bash
kubectl exec restricted-client -- \
  curl \
  --max-time 3 \
  http://api-v1
```

It should fail.

The portable API remains:

```text
NetworkPolicy
      |
      v
Kubernetes API
      |
      v
Cilium
      |
      v
actual enforcement
```

Delete it before continuing:

```bash
kubectl delete networkpolicy api-v1-deny
```

Verify connectivity returns:

```bash
kubectl exec restricted-client -- \
  curl -s http://api-v1
```

This is why the main CKAD cookbook keeps `NetworkPolicy` and punts the Cilium implementation detail here.

---

# D.21 CiliumNetworkPolicy - Deliberately Cross the Portability Boundary

Sometimes the portable Kubernetes API does not express the policy we want.

Cilium provides:

```text
CiliumNetworkPolicy
```

as a CRD for additional capabilities.

This is the point where we intentionally choose a vendor/platform-specific API.

We will enforce an HTTP-layer rule.

Create an L7 test server:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: l7-api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: l7-api
  template:
    metadata:
      labels:
        app: l7-api
    spec:
      containers:
        - name: web
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              mkdir -p /www
              echo "you reached allowed" > /www/allowed
              echo "you reached denied" > /www/denied
              httpd -f -p 8080 -h /www
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: l7-api
spec:
  selector:
    app: l7-api
  ports:
    - port: 80
      targetPort: 8080
```

Save as:

```text
l7-api.yaml
```

Apply:

```bash
kubectl apply -f l7-api.yaml
```

Baseline:

```bash
kubectl exec restricted-client -- \
  curl -s http://l7-api/allowed
```

Then:

```bash
kubectl exec restricted-client -- \
  curl -s http://l7-api/denied
```

Both should work.

Now create:

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: l7-api-policy
spec:

  endpointSelector:
    matchLabels:
      app: l7-api

  ingress:
    - fromEndpoints:
        - matchLabels:
            role: client

      toPorts:
        - ports:
            - port: "8080"
              protocol: TCP

          rules:
            http:
              - method: GET
                path: "/allowed$"
```

Save as:

```text
cilium-l7-policy.yaml
```

Apply:

```bash
kubectl apply -f cilium-l7-policy.yaml
```

Allowed:

```bash
kubectl exec restricted-client -- \
  curl -i http://l7-api/allowed
```

Denied:

```bash
kubectl exec restricted-client -- \
  curl -i http://l7-api/denied
```

The policy is now making an L7 decision:

```text
source identity
      |
      v
TCP :8080
      |
      v
HTTP GET
      |
      v
path /allowed
      |
      +--> allow

anything else
      |
      +--> deny
```

This is functionality beyond the standard Kubernetes `NetworkPolicy` API.

That power comes with a portability tradeoff.

Delete when finished:

```bash
kubectl delete ciliumnetworkpolicy l7-api-policy
```

---

# D.22 Enable Hubble

Cilium gives us another useful implementation-specific feature:

```text
Hubble
```

Hubble provides network observability over Cilium-managed endpoints.

Enable Relay:

```bash
cilium hubble enable
```

Wait:

```bash
cilium status --wait
```

You should see Hubble Relay become available.

---

# D.23 Install the Hubble CLI

On Linux:

```bash
HUBBLE_VERSION="$(
  curl -s \
  https://raw.githubusercontent.com/cilium/hubble/main/stable.txt
)"

HUBBLE_ARCH=amd64

if [ "$(uname -m)" = "aarch64" ]; then
  HUBBLE_ARCH=arm64
fi
```

Download:

```bash
curl -L --fail --remote-name-all \
  "https://github.com/cilium/hubble/releases/download/${HUBBLE_VERSION}/hubble-linux-${HUBBLE_ARCH}.tar.gz"{,.sha256sum}
```

Verify:

```bash
sha256sum --check \
  "hubble-linux-${HUBBLE_ARCH}.tar.gz.sha256sum"
```

Install:

```bash
sudo tar xzvfC \
  "hubble-linux-${HUBBLE_ARCH}.tar.gz" \
  /usr/local/bin
```

Cleanup:

```bash
rm "hubble-linux-${HUBBLE_ARCH}.tar.gz"{,.sha256sum}
```

Check:

```bash
hubble version
```

Validate Relay:

```bash
hubble status -P
```

`-P` tells the CLI to set up the required local port-forward automatically.

---

# D.24 Observe Traffic Instead of Guessing

Generate traffic:

```bash
for i in $(seq 1 5); do
  curl -s \
    -H 'Host: api.example.test' \
    "http://${GATEWAY_NODE_IP}:8080/" >/dev/null
done
```

Observe recent flows:

```bash
hubble observe -P \
  --last 20
```

Observe traffic to the backend namespace:

```bash
hubble observe -P \
  --namespace gateway-lab \
  --last 30
```

You can also filter by Pod:

```bash
hubble observe -P \
  --pod gateway-lab/api-v1 \
  --last 20
```

The debugging model improves from:

```text
"It looks like networking."
```

to:

```text
What flow happened?

From which identity?

To which destination?

Was it forwarded or dropped?

At which layer?
```

---

# D.25 Observe a Policy Drop

Reapply the Cilium L7 policy:

```bash
kubectl apply -f cilium-l7-policy.yaml
```

Generate an allowed request:

```bash
kubectl exec restricted-client -- \
  curl -s http://l7-api/allowed
```

Generate a denied request:

```bash
kubectl exec restricted-client -- \
  curl -s http://l7-api/denied || true
```

Inspect Hubble:

```bash
hubble observe -P \
  --pod gateway-lab/l7-api \
  --last 30
```

Now we can tie together:

```text
CiliumNetworkPolicy
       |
       v
policy calculation
       |
       v
Envoy / dataplane enforcement
       |
       v
Hubble flow event
```

Delete the policy:

```bash
kubectl delete ciliumnetworkpolicy l7-api-policy
```

---

# D.26 Gateway API Debugging Order

When Gateway traffic fails, debug from the API downward.

Do not begin with packet captures.

Use this order:

```text
GatewayClass
     |
     v
Gateway
     |
     v
HTTPRoute
     |
     v
Service
     |
     v
EndpointSlice
     |
     v
Pod readiness
     |
     v
Cilium / Envoy
     |
     v
Hubble
     |
     v
Linux dataplane
```

Useful commands:

```bash
kubectl get gatewayclass
```

```bash
kubectl describe gateway public
```

```bash
kubectl describe httproute api
```

```bash
kubectl get service api-v1
```

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api-v1
```

```bash
kubectl get pods \
  -l app=api-v1 \
  -o wide
```

```bash
cilium status
```

```bash
hubble observe -P --last 30
```

Only go further down once the upper layer is known to be correct.

---

# D.27 Gateway API Status Is Part of the Contract

Query Gateway conditions:

```bash
kubectl get gateway public \
  -o jsonpath='{range .status.conditions[*]}{.type}={.status}{" reason="}{.reason}{"\n"}{end}'
```

Query HTTPRoute conditions:

```bash
kubectl get httproute api \
  -o jsonpath='{range .status.parents[*].conditions[*]}{.type}={.status}{" reason="}{.reason}{"\n"}{end}'
```

This is the same lesson as:

```text
spec
  -> what I want

status
  -> what the controller observed
```

from the core cookbook.

Gateway API makes the controller relationship particularly visible.

---

# D.28 Optional - Why We Used Host-Network Mode

By default, Cilium's Gateway controller creates a:

```text
Service type=LoadBalancer
```

That works naturally when a platform already provides a LoadBalancer implementation.

Our kubeadm lab does not.

Possible real-world solutions include:

```text
cloud load balancer integration
Cilium LB IPAM + L2 announcements
Cilium LB IPAM + BGP
external load balancer
Cilium host-network Gateway mode
```

For this lab we chose:

```text
host-network mode
```

because it lets us focus on:

```text
Gateway API
Cilium
Envoy
routing
policy
observability
```

without first building an entire bare-metal load-balancer control plane.

That is a learning choice, not a universal production recommendation.

---

# D.29 Optional - The LoadBalancer Problem on Bare Metal

A Kubernetes Service can say:

```yaml
spec:
  type: LoadBalancer
```

but that does not magically create an external load balancer.

Again:

```text
API object exists
```

does not imply:

```text
implementation exists
```

On bare metal someone still needs to answer:

```text
Who allocates the external IP?

Who advertises it onto the network?

Who makes traffic reach the nodes?
```

Cilium can participate in those layers with:

```text
LB IPAM
L2 Announcements
BGP Control Plane
Node IPAM LB
```

Those are excellent platform-engineering topics.

They are intentionally outside this first Gateway API lab.

---

# D.30 Clean Up the Lab

Delete Gateway resources:

```bash
kubectl delete httproute api \
  --ignore-not-found

kubectl delete gateway public \
  --ignore-not-found
```

Delete application resources:

```bash
kubectl delete deployment \
  api-v1 \
  api-v2 \
  l7-api \
  --ignore-not-found

kubectl delete service \
  api-v1 \
  api-v2 \
  l7-api \
  --ignore-not-found

kubectl delete pod \
  client \
  restricted-client \
  --ignore-not-found
```

Delete cross-namespace resources:

```bash
kubectl delete namespace payments \
  --ignore-not-found
```

Delete the lab namespace:

```bash
kubectl delete namespace gateway-lab
```

Switch your current context back to default:

```bash
kubectl config set-context \
  --current \
  --namespace=default
```

We normally leave the Gateway API CRDs and Cilium installation in place because they are cluster-level platform components.

For a fully disposable lab, reset the cluster using Appendix C instead.

---

# D.31 The Full Request Path

We can now describe a request from outside the cluster.

```text
curl
 |
 | Host: api.example.test
 v
Linux node :8080
 |
 v
Cilium / Envoy
 |
 | listener selected
 v
Gateway/public
 |
 | route selected
 v
HTTPRoute/api
 |
 | backendRef
 v
Service/api-v1
 |
 | endpoints
 v
EndpointSlice
 |
 v
Pod IP
 |
 v
Cilium dataplane
 |
 v
container
```

At the same time:

```text
Kubernetes API
      |
      +--> stores Gateway
      |
      +--> stores HTTPRoute
      |
      +--> stores Service
      |
      +--> stores EndpointSlice
      |
      v
controllers observe
      |
      v
lower-level state changes
```

That is Kubernetes reconciliation expressed as networking.

---

# D.32 The Architecture We Now Understand

At the beginning of the cookbook:

```text
Service -> Pods
```

was enough.

Now we can expand it:

```text
                         Kubernetes API
                               |
              +----------------+----------------+
              |                |                |
              v                v                v
          Gateway          HTTPRoute        Service
              |                |                |
              +--------+-------+                |
                       |                        |
                       v                        v
                 Cilium controller         EndpointSlice
                       |                        |
                       v                        |
                    Envoy                       |
                       |                        |
                       +-----------+------------+
                                   |
                                   v
                              Cilium agent
                                   |
                                   v
                                eBPF
                                   |
                                   v
                              Linux kernel
                                   |
                                   v
                                  Pod
```

And with observability:

```text
packet / request
      |
      v
Cilium dataplane
      |
      +----> enforcement
      |
      +----> Hubble
               |
               v
          observable flow
```

---

# D.33 Portability vs Platform Power

The core cookbook deliberately favoured APIs such as:

```text
Service
NetworkPolicy
Ingress
```

because they are portable Kubernetes APIs.

This appendix used:

```text
Gateway API
```

which is portable across conformant Gateway implementations.

Then we deliberately crossed into:

```text
CiliumNetworkPolicy
Cilium identities
Hubble
eBPF maps
Cilium host-network Gateway mode
```

Those are implementation-specific.

That is not inherently bad.

It is a tradeoff.

```text
Portable API
    |
    +--> easier platform portability
    |
    +--> common Kubernetes mental model


Implementation-specific API
    |
    +--> richer platform capability
    |
    +--> tighter coupling to the implementation
```

The important thing is to know which side of the boundary you are on.

---

# D.34 The Model to Remember

For networking:

```text
Application intent
      |
      v
Kubernetes API
      |
      v
Controller / network implementation
      |
      v
Envoy / eBPF / Linux
      |
      v
actual traffic
```

For debugging:

```text
API status
   |
   v
references
   |
   v
Services / endpoints
   |
   v
implementation status
   |
   v
observed flows
   |
   v
dataplane
```

Do not jump straight to the bottom.

Prove each layer.

---

# D.35 Where You Are Now

The learning path has become:

```text
kind
  |
  v
"Give me Kubernetes"
  |
  v
CKAD cookbook
  |
  v
"Teach me Kubernetes APIs"
  |
  v
kubeadm
  |
  v
"Show me where Kubernetes comes from"
  |
  v
Cilium
  |
  v
"Show me how networking is implemented"
  |
  v
Gateway API
  |
  v
"Give platform and application teams a modern routing API"
  |
  v
Hubble / eBPF
  |
  v
"Show me what the dataplane is actually doing"
```

At this point the cluster should feel much less magical.

You can follow a concept from:

```text
YAML
```

all the way to:

```text
Linux packet forwarding
```

without confusing those layers with one another.

---

# Reference Versions

This appendix was written against:

```text
Kubernetes:  1.35
Cilium:      1.20.1
Gateway API: 1.6.1
```

Cilium 1.20.1 officially supports Kubernetes 1.35.

Its Gateway API implementation supports Gateway API 1.6.1 and requires:

```text
kubeProxyReplacement=true
```

with L7 proxy support enabled.

Cilium host-network Gateway mode is used here specifically so the kubeadm lab does not require a separate `LoadBalancer` implementation.

Always check the matching upstream documentation when moving to a newer Cilium or Gateway API version.
