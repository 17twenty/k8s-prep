Until now we have mostly used `kubectl` as a highly privileged lab administrator.

That is useful for learning, but it hides an important production question:

> Who should be allowed to do what?

There are several separate decisions in the Kubernetes API request path.

```text
request
   |
   v
authentication
   |
   | who are you?
   v
authorization
   |
   | may that identity perform this action?
   v
admission
   |
   | for writes: is this object acceptable, or should it be mutated?
   v
Kubernetes API state
```

Keeping those stages separate avoids a lot of security confusion.

## Humans and workloads use different kinds of identity

Kubernetes commonly deals with two broad identity types:

```text
human / external client          workload inside Kubernetes
          |                                |
          v                                v
     User / Group                    ServiceAccount
          |                                |
          +---------------+----------------+
                          |
                          v
                         RBAC
```

A `ServiceAccount` is a Kubernetes API object.

A normal human `User` is not.

Kubernetes does not provide a `User` resource that you create with:

```text
kubectl create user alice
```

Instead, human authentication normally comes from something outside the Kubernetes object model, such as:

```text
client certificate
OIDC / SSO identity
cloud IAM integration
authentication proxy
```

After authentication, the API server has identity information such as:

```text
username: alice
groups:
  - developers
```

RBAC then decides what that identity may do.

## Lab: give Alice namespace-scoped developer access

We do not need to configure a real identity provider just to learn authorization.

`kubectl` can ask the API server to evaluate a request as another identity using impersonation.

> `--as=alice` does not create Alice. It asks the API server to evaluate the request as the username `alice`. Your current identity must itself be allowed to impersonate users. The administrator credentials used by our kind lab normally are.

Create a namespace-scoped developer role.

Save as `alice-rbac.yaml`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: developer
  namespace: cookbook
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "create", "update", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: alice-developer
  namespace: cookbook
subjects:
  - kind: User
    name: alice
    apiGroup: rbac.authorization.k8s.io
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: developer
```

Apply it:

```bash
kubectl apply -f alice-rbac.yaml
```

Ask whether Alice can read Pods in our namespace:

```bash
kubectl auth can-i list pods \
  --as=alice \
  -n cookbook
```

Expected:

```text
yes
```

Can she change a Deployment?

```bash
kubectl auth can-i patch deployments \
  --as=alice \
  -n cookbook
```

Expected:

```text
yes
```

Can she read Secrets?

```bash
kubectl auth can-i get secrets \
  --as=alice \
  -n cookbook
```

Expected:

```text
no
```

Can she administer another namespace?

```bash
kubectl auth can-i patch deployments \
  --as=alice \
  -n default
```

Expected:

```text
no
```

Can she delete a cluster-scoped Node object?

```bash
kubectl auth can-i delete nodes \
  --as=alice
```

Expected:

```text
no
```

This is the permission boundary we wanted:

```text
Alice
  |
  v
Kubernetes API
  |
  +-- read Pods in cookbook             yes
  +-- change Deployments in cookbook    yes
  +-- read Secrets in cookbook          no
  +-- change Deployments in default     no
  +-- delete Nodes                       no
```

You can ask for a broader view of the permissions Kubernetes calculates:

```bash
kubectl auth can-i --list \
  --as=alice \
  -n cookbook
```

## RBAC permissions are additive

Kubernetes RBAC grants permissions.

It does not contain explicit `deny` rules.

Think:

```text
matching allow rule exists
        -> allowed

no matching allow rule
        -> not allowed
```

That means you need to consider **all** RoleBindings and ClusterRoleBindings attached to an identity.

A narrow RoleBinding does not protect Alice if some other binding also gives her broad cluster permissions.

## A permission can have indirect effects

Alice cannot directly create Pods with the Role above.

Check:

```bash
kubectl auth can-i create pods \
  --as=alice \
  -n cookbook
```

Expected:

```text
no
```

But Alice *can* create a Deployment.

A Deployment controller can then create ReplicaSets and Pods on her behalf.

```text
Alice
  |
  | create Deployment allowed
  v
Deployment
  |
  v
Deployment controller
  |
  v
ReplicaSet
  |
  v
Pods
```

Authorization is evaluated against the API request Alice makes.

You therefore need to reason about what a permitted object can cause controllers to do, not merely about the object's name.

This becomes particularly important with powerful workload features such as privileged containers, host mounts and scheduling controls.

## ServiceAccount: workload identity

Now do the same exercise for an application rather than a human.

Create a ServiceAccount:

```bash
kubectl create serviceaccount api-sa
```

Inspect it:

```bash
kubectl get serviceaccount api-sa -o yaml
```

Modern Kubernetes normally gives Pods short-lived projected ServiceAccount credentials rather than relying on automatically created permanent token Secrets.

Request a temporary token when the cluster allows it:

```bash
kubectl create token api-sa
```

Assign the ServiceAccount to our Deployment:

```bash
kubectl set serviceaccount deployment/api api-sa
```

Wait:

```bash
kubectl rollout status deployment/api
```

Check:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.template.spec.serviceAccountName}{"\n"}'
```

Expected:

```text
api-sa
```

Give that workload identity read-only Pod access.

Save as `workload-rbac.yaml`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: cookbook
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: api-sa-pod-reader
  namespace: cookbook
subjects:
  - kind: ServiceAccount
    name: api-sa
    namespace: cookbook
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: pod-reader
```

Apply:

```bash
kubectl apply -f workload-rbac.yaml
```

Ask whether that identity may list Pods:

```bash
kubectl auth can-i list pods \
  --as=system:serviceaccount:cookbook:api-sa \
  -n cookbook
```

Expected:

```text
yes
```

Ask whether it may delete them:

```bash
kubectl auth can-i delete pods \
  --as=system:serviceaccount:cookbook:api-sa \
  -n cookbook
```

Expected:

```text
no
```

Human and workload authorization now look almost identical after authentication:

```text
User/alice --------------------+
                               |
ServiceAccount/api-sa ---------+
                               |
                               v
                              RBAC
                               |
                         allowed verbs
                         on resources
                         in a scope
```

## Role, ClusterRole, RoleBinding and ClusterRoleBinding

RBAC has four main API objects.

```text
Role
  -> permission rules defined for one namespace

ClusterRole
  -> reusable permission rules
  -> can also describe cluster-scoped resources

RoleBinding
  -> grants a Role or ClusterRole inside one namespace

ClusterRoleBinding
  -> grants a ClusterRole across the cluster
```

A useful relationship is:

```text
subject
  |
  | User / Group / ServiceAccount
  v
binding
  |
  v
role containing rules
  |
  v
verbs + resources
```

For example:

```text
alice
  |
  v
RoleBinding/cookbook
  |
  v
Role/developer
  |
  +-- get/list/watch Pods
  +-- create/update/patch Deployments
```

Be especially careful with `ClusterRoleBinding`.

This:

```text
Alice can administer one namespace
```

and this:

```text
Alice can administer the whole cluster
```

can differ by only the binding used.

## A namespace is a scope, not an automatic security boundary

Namespaces are extremely useful administrative boundaries.

But merely placing two teams in different namespaces does not automatically isolate them.

```text
namespace alone
    !=
permission boundary
```

You normally combine namespaces with controls such as:

```text
RBAC
ResourceQuota / LimitRange
NetworkPolicy
Pod security / admission policy
storage policy
```

The exact isolation you need depends on whether the tenants trust one another.

## API permission, workload placement and machine access are different controls

This distinction matters particularly around control-plane nodes.

There are at least three independent questions:

```text
1. API authorization
   "Can Alice delete or modify this Node object?"

2. workload placement
   "Can this Pod be scheduled onto this node?"

3. machine access
   "Can Alice SSH into or otherwise administer the actual host?"
```

They are enforced by different layers:

```text
                         control-plane machine
                                  |
          +-----------------------+-----------------------+
          |                       |                       |
          v                       v                       v
   Kubernetes API            scheduler target          Linux / VM / metal
          |                       |                       |
         RBAC              taints / tolerations       IAM / SSH / firewall
                          affinity / selectors        OS permissions
```

For example, control-plane nodes are commonly tainted so ordinary workloads do not schedule there:

```text
node-role.kubernetes.io/control-plane:NoSchedule
```

That is a **scheduling control**.

It is not the same thing as denying API access to Node objects, and it is not the same thing as denying SSH access to the machine.

It is also not, by itself, a strong tenant security boundary: a workload that is allowed to specify a matching toleration can become eligible for the node.

Likewise:

```bash
kubectl auth can-i delete nodes --as=alice
```

answers an API authorization question.

It tells you nothing about whether Alice has infrastructure credentials for the underlying VM or bare-metal host.

## What about the kubelet itself? [DEV] [DEEP DIVE]

Nodes are API clients too.

A kubelet commonly authenticates with an identity resembling:

```text
system:node:worker-01
```

Kubernetes has a special-purpose **Node authorizer** that can constrain kubelet API access based on the Pods assigned to that node.

The **NodeRestriction** admission plugin adds additional restrictions around what kubelets may modify.

Conceptually:

```text
human / application identities
        -> RBAC

kubelet node identities
        -> Node authorizer
        -> NodeRestriction admission
```

You do not need to configure these for CKAD, but knowing that node identity has its own authorization path prevents the misleading idea that every Kubernetes permission problem is just a RoleBinding.

## RBAC is not the same thing as multi-tenancy [DEV] [DEEP DIVE]

RBAC can give multiple teams restricted access to one Kubernetes API:

```text
Alice ----+
          |
Bob ------+--> one kube-apiserver
          |        |
          |       RBAC
          |        |
          +--> namespace-scoped views
```

That can be entirely appropriate for trusted teams.

But stronger tenancy may instead give each tenant its own Kubernetes API/control-plane boundary:

```text
Alice ---> tenant A API

Bob -----> tenant B API

                |
                v
        provider infrastructure
```

Projects such as **vCluster** and **Kamaji** operate in this design space, although they implement it differently.

RBAC still exists inside each tenant cluster. The difference is that the tenant boundary no longer depends only on permissions inside one shared API server.

The companion `multitenancy-appendix.md` continues this model and compares shared-cluster RBAC, vCluster and Kamaji without turning the CKAD path into a platform-engineering course.

## Admission control

Authorization is not necessarily the final decision for a write request.

After authentication and authorization, admission can validate or mutate an incoming object before it is persisted.

Examples include:

- Pod security requirements
- quotas
- policy rules
- injected defaults
- validating or mutating webhooks

This explains a useful failure class:

```text
I am authenticated
      |
      v
I am authorized
      |
      v
write request still rejected
      |
      v
check admission or policy error
```

One subtle distinction: normal read operations such as `get`, `list` and `watch` do not pass through admission control in the same way write requests do.

## The permission model to keep

When something is denied, ask which boundary you are actually debugging:

```text
Who am I?
  -> authentication

May I make this API request?
  -> authorization / RBAC

Is this write acceptable?
  -> admission

May this workload land on that node?
  -> scheduling controls

May this workload talk to another workload?
  -> NetworkPolicy / network controls

May this person administer the actual machine?
  -> infrastructure IAM / SSH / OS controls
```

Those controls cooperate, but they are not substitutes for one another.

Cleanup the lab RBAC objects, but keep the ServiceAccount because the Deployment currently uses it:

```bash
kubectl delete -f alice-rbac.yaml
kubectl delete -f workload-rbac.yaml
rm -f alice-rbac.yaml workload-rbac.yaml
```
