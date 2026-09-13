Once you understand controllers, several Kubernetes mechanisms become easier to place.

They are not arbitrary advanced features.

They help controllers express responsibility, cleanup and observed state.

## Ownership

We already have a live built-in example.

Inspect one Deployment Pod:

```bash
POD=$(kubectl get pod -l app=api \
  -o jsonpath='{.items[0].metadata.name}')

kubectl get pod "$POD" \
  -o jsonpath='{.metadata.ownerReferences}{"\n"}'
```

The Pod is owned by a ReplicaSet.

Inspect the ReplicaSet:

```bash
RS=$(kubectl get rs -l app=api \
  --sort-by=.metadata.creationTimestamp \
  -o jsonpath='{.items[-1:].metadata.name}')

kubectl get rs "$RS" \
  -o jsonpath='{.metadata.ownerReferences}{"\n"}'
```

A Deployment-managed ReplicaSet has an owner reference to the Deployment.

```text
Deployment
    |
    v
ReplicaSet
    |
    v
Pod
```

A custom controller can use the same mechanism:

```text
PreviewEnvironment
       |
       +-- Deployment
       |
       +-- Service
```

Ownership helps Kubernetes determine controller responsibility and garbage collection.

Labels and ownership are not the same thing:

```text
label
  -> which objects match this query/selector?

ownerReference
  -> which object controls this dependent resource?
```

## Finalizers

Sometimes deleting an API object must trigger cleanup outside that object first.

Examples could include:

- delete a cloud database
- release a load balancer
- remove DNS records
- detach external storage

A finalizer delays final deletion until responsible cleanup logic removes the finalizer.

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

A real controller would now perform cleanup and then remove its finalizer.

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

## Status and conditions

A well-designed custom API separates:

```text
spec
  -> what the user wants

status
  -> what the controller currently observes
```

Example:

```yaml
spec:
  image: shop:pr-482
  replicas: 2

status:
  readyReplicas: 2
  url: https://pr-482.example.com
```

Structured conditions make normal operational state visible through the API:

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

A good controller should not force users to read controller logs merely to determine normal resource state.

## Operators

An Operator is not a special class of executable understood by Kubernetes.

Think:

```text
Custom API
    +
Controller
    +
Domain knowledge
```

For a database API:

```yaml
kind: DatabaseCluster
spec:
  version: "18"
  replicas: 3
```

The Operator might understand how to:

```text
create members
bootstrap replication
replace failed members
take backups
restore backups
rotate credentials
perform upgrades
```

That is still the same reconciliation model used by Deployments, applied to a domain with richer operational knowledge.

## Controller failure modes

### Non-idempotent reconciliation

Bad:

```text
Every reconcile creates another cloud database.
```

Better:

```text
Check whether the required database exists.
Create it only when absent.
Update it only when desired state differs.
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
controller writes same state again
        |
        +------ loop
```

Only write when state actually differs.

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

### Status that lies

Do not report `Ready=True` merely because a child object was created.

Report what the API contract says readiness means.

A controller is useful when it turns desired state into truthful, convergent behaviour.
