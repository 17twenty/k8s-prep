Once you understand controllers, several Kubernetes mechanisms become easier to place.

They are not arbitrary advanced features.

They help controllers express responsibility, cleanup and observed state.

We now have our own controller running, so we can inspect these mechanisms on something we built rather than only discussing them in the abstract.

## Ownership: which object is responsible for this child?

First inspect the Deployment created for our preview:

```bash
kubectl get deployment pr-482 \
  -o jsonpath='{.metadata.ownerReferences}{"\n"}'
```

Then the Service:

```bash
kubectl get service pr-482 \
  -o jsonpath='{.metadata.ownerReferences}{"\n"}'
```

Both should point at:

```text
PreviewEnvironment/pr-482
```

The relationship is:

```text
PreviewEnvironment/pr-482
       |
       +-- Deployment/pr-482
       |        |
       |        v
       |     ReplicaSet
       |        |
       |        v
       |       Pods
       |
       +-- Service/pr-482
```

Compare that with the built-in chain we saw earlier:

```text
Deployment
    |
    v
ReplicaSet
    |
    v
Pod
```

Our controller is using the same Kubernetes ownership mechanism as built-in controllers.

Labels and ownership are not the same thing:

```text
label
  -> which objects match this query/selector?

ownerReference
  -> which object controls this dependent resource?
```

## Controller responsibility: delete a child

Delete the generated Service:

```bash
kubectl delete service pr-482
```

Watch the labelled Service set:

```bash
kubectl get service   -l platform.example.com/preview=pr-482   -w
```

Within a reconciliation cycle, the Service should reappear.

That happened because our controller still sees:

```text
PreviewEnvironment/pr-482 exists
        |
        v
Service/pr-482 should exist
```

Ownership did not recreate the Service.

**Reconciliation did.**

That distinction matters.

Owner references describe relationships and enable garbage collection; controllers are the actors that continuously restore desired state.

## Status: report observed state through the API

Chapter 33 gave the CRD a `status` subresource.

Chapter 34 made the controller populate it.

Inspect it:

```bash
kubectl get preview pr-482 \
  -o jsonpath='{.spec.replicas}{" desired, "}{.status.readyReplicas}{" ready, "}{.status.url}{"\n"}'
```

You should see something like:

```text
3 desired, 3 ready, http://pr-482.cookbook.svc.cluster.local
```

We have now implemented the same pattern we met in Chapter 1:

```text
spec
  -> what the user wants

status
  -> what the controller currently observes
```

A useful custom API should let normal operational questions be answered from the API.

Users should not have to start with controller logs simply to discover whether the requested system is ready.

### Conditions

Our tiny controller deliberately reports only two status fields.

Larger APIs commonly expose structured conditions:

```yaml
status:
  conditions:
    - type: Ready
      status: "True"
      reason: DeploymentAvailable
```

Common condition concepts include:

```text
Ready
Available
Progressing
Degraded
```

Conditions are especially useful when `readyReplicas: 1` is not enough to explain *why* the system is not ready.

## Garbage collection: delete the owner

Now delete the `PreviewEnvironment` itself:

```bash
kubectl delete preview pr-482
```

Watch its children:

```bash
kubectl get deployment,service \
  -l platform.example.com/preview=pr-482 \
  -w
```

Because the Deployment and Service contain owner references to the custom resource, Kubernetes garbage collection can remove them when the owner disappears.

The path is:

```text
PreviewEnvironment deleted
        |
        v
ownerReferences become invalid
        |
        v
garbage collector removes dependants
```

Our controller does not need explicit code saying:

```text
on PreviewEnvironment delete:
    delete Deployment
    delete Service
```

for these Kubernetes-native child resources.

Recreate the preview so the rest of the chapter can continue:

```bash
kubectl apply -f preview.yaml
kubectl wait   --for=create   deployment/pr-482   --timeout=30s
kubectl rollout status deployment/pr-482
```

## Finalizers: cleanup that garbage collection cannot perform for you

Owner references work well for Kubernetes objects.

But suppose our controller also created something **outside** Kubernetes:

```text
DNS record
cloud database
SaaS tenant
external load balancer
```

Kubernetes garbage collection cannot delete an external database merely because an API object disappeared.

That is where finalizers fit.

A finalizer delays final deletion until responsible cleanup logic has completed.

Create a harmless demo object:

```bash
kubectl create configmap finalizer-demo \
  --from-literal=test=true
```

Add a finalizer:

```bash
kubectl patch configmap finalizer-demo \
  --type=merge \
  -p '{"metadata":{"finalizers":["example.com/demo"]}}'
```

Request deletion without waiting:

```bash
kubectl delete configmap finalizer-demo --wait=false
```

Inspect:

```bash
kubectl get configmap finalizer-demo -o yaml
```

Notice:

```yaml
deletionTimestamp: ...
```

The object is pending deletion because its finalizer remains.

A real controller would now:

```text
observe deletionTimestamp
        |
        v
perform external cleanup
        |
        v
remove its finalizer
        |
        v
Kubernetes completes deletion
```

For the lab, remove it manually:

```bash
kubectl patch configmap finalizer-demo \
  --type=json \
  -p='[
    {
      "op":"remove",
      "path":"/metadata/finalizers"
    }
  ]'
```

Check:

```bash
kubectl get configmap finalizer-demo
```

It should be gone.

This explains many resources that appear to be:

```text
stuck Terminating
```

The object may be waiting for a controller to finish a cleanup contract.

## Operator: controller plus domain knowledge

An Operator is not a special executable type understood by Kubernetes.

Think:

```text
Custom API
    +
Controller
    +
Domain knowledge
```

Our `PreviewEnvironment` controller knows only a tiny domain rule:

```text
PreviewEnvironment
    -> nginx-compatible Deployment
    -> Service on port 80
```

A database Operator might understand much more:

```yaml
kind: DatabaseCluster
spec:
  version: "18"
  replicas: 3
```

and reconcile operations such as:

```text
create members
bootstrap replication
replace failed members
take backups
restore backups
rotate credentials
perform upgrades
```

It is still the same reconciliation model.

The domain knowledge is richer.

## Controller failure modes

Writing a controller makes several failure modes easier to understand.

### Non-idempotent reconciliation

Bad:

```text
Every reconcile creates another cloud database.
```

Better:

```text
Ensure the required database exists.
Create it only when absent.
Update it only when desired state differs.
```

Our lab controller used server-side apply for exactly this reason:

```text
same desired child object
        |
        v
apply repeatedly
        |
        v
convergent state
```

rather than:

```text
reconcile #1 -> Deployment A
reconcile #2 -> Deployment B
reconcile #3 -> Deployment C
```

### Update loops

A controller can trigger itself:

```text
controller updates object
        |
        v
watch event
        |
        v
reconcile
        |
        v
controller writes identical state again
        |
        +------ loop
```

Only write when state actually differs.

Our status code checks whether `readyReplicas` or `url` changed before issuing another status update.

### Fighting controllers

Two controllers should not continually attempt to own the same field or external resource in incompatible ways.

Otherwise:

```text
controller A writes X
      |
controller B writes Y
      |
controller A writes X
      |
      +---- forever
```

Server-side apply field ownership can help make those conflicts explicit, but it does not make contradictory intent disappear.

### Status that lies

Do not report `Ready=True` merely because a child object was created.

Report what the API contract says readiness means.

For our preview API, `readyReplicas` comes from the child Deployment's observed status rather than simply copying `spec.replicas`.

That difference is the entire point of status.

A controller is useful when it turns desired state into truthful, convergent behaviour.
