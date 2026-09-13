We already used a Deployment before formally studying it because it gave us the smallest useful reconciliation experiment.

Now we can unpack the machinery.

A Deployment is appropriate for replaceable application replicas where individual Pod identity does not matter.

The ownership chain is:

```text
Deployment
    |
    v
ReplicaSet
    |
    +-- Pod
    +-- Pod
    +-- Pod
```

## Inspect the Deployment

```bash
kubectl get deployment api
```

ReplicaSet:

```bash
kubectl get replicasets -l app=api
```

Pods:

```bash
kubectl get pods -l app=api
```

## Follow ownership through the API

Pod -> ReplicaSet:

```bash
kubectl get pods \
  -l app=api \
  -o custom-columns='POD:.metadata.name,OWNER:.metadata.ownerReferences[0].name'
```

ReplicaSet -> Deployment:

```bash
kubectl get rs \
  -l app=api \
  -o custom-columns='RS:.metadata.name,OWNER:.metadata.ownerReferences[0].name'
```

The ownership chain is not hidden state.

It is represented in the API.

## Scaling is reconciliation, not cloning

Scale to five:

```bash
kubectl scale deployment api --replicas=5
```

Watch:

```bash
kubectl get pods -l app=api -w
```

Then inspect:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.replicas}{" desired, "}{.status.readyReplicas}{" ready\n"}'
```

Scale back:

```bash
kubectl scale deployment api --replicas=3
```

Scaling does not create a new Deployment revision because it does not change the Pod template.

## The Pod template is the important boundary

Inspect:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.template}{"\n"}'
```

A Deployment says, approximately:

```text
I want N Pods that look like this template.
```

Changing `replicas` changes **how many** Pods.

Changing `.spec.template` changes **what the Pods should be**, which leads directly to rolling updates.
