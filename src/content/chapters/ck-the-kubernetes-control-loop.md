Before learning all of Kubernetes' resource types, learn the one idea that connects nearly all of them.

Kubernetes is not primarily a system for running commands on servers.

It is a system for **declaring what you want** and continuously trying to make reality match it.

Conceptually:

```text
you declare what you want
        |
        v
   Kubernetes API
        |
        v
     controller
    /    |     \
observe compare  act
    \    |     /
        reality
        |
        +-------- repeat
```

This repeating process is called **reconciliation**.

Let's make it happen rather than just defining it.

## Start with one application

Create an nginx Deployment with one replica:

```bash
kubectl create deployment api \
  --image=nginx:1.27-alpine \
  --replicas=1
```

Look at the Deployment:

```bash
kubectl get deployment api
```

And the Pod it caused Kubernetes to create:

```bash
kubectl get pods -l app=api
```

You asked Kubernetes for one copy of nginx.

A Pod now exists.

The important part is how Kubernetes represents that request.

## `spec` is what you asked for

Ask the API how many replicas the Deployment should have:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.replicas}{"\n"}'
```

Expected:

```text
1
```

That value lives under something like:

```yaml
spec:
  replicas: 1
```

`spec` describes **desired state**.

It is your instruction to Kubernetes:

> I want one replica of this application.

Now ask Kubernetes how many replicas are actually ready:

```bash
kubectl get deployment api \
  -o jsonpath='{.status.readyReplicas}{"\n"}'
```

Once nginx is ready, you should see:

```text
1
```

That value comes from `status`:

```yaml
status:
  readyReplicas: 1
```

A useful first approximation is:

```text
spec    -> what you want
status  -> what Kubernetes currently sees
```

You normally change `spec`.

Kubernetes and its controllers populate `status`.

## Change what you want

Suppose one replica is no longer enough.

Tell Kubernetes you want three:

```bash
kubectl scale deployment api --replicas=3
```

This command did not directly start two containers.

It changed the desired state stored in the Kubernetes API.

Check:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.replicas}{"\n"}'
```

Now:

```text
3
```

Watch the Pods:

```bash
kubectl get pods -l app=api -w
```

Two more Pods should appear.

Press `Ctrl-C` once all three are running.

Now compare desired state with observed state:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.replicas}{" desired, "}{.status.readyReplicas}{" ready\n"}'
```

Eventually:

```text
3 desired, 3 ready
```

For a short time the system may have looked like:

```text
spec.replicas:          3
status.readyReplicas:   1
```

Desired state and observed state disagreed.

Controllers noticed the difference and acted.

Eventually:

```text
spec.replicas:          3
status.readyReplicas:   3
```

Reality caught up with intent.

That is reconciliation.

## Change reality instead

Now do the opposite.

Instead of changing what we want, interfere with what actually exists.

Delete one Pod:

```bash
kubectl delete pod \
  $(kubectl get pods \
    -l app=api \
    -o jsonpath='{.items[0].metadata.name}')
```

Immediately watch:

```bash
kubectl get pods -l app=api -w
```

The Pod you deleted disappears.

Then another Pod appears.

This distinction matters:

> The old Pod did not restart. Kubernetes created a replacement.

Why?

Deleting a Pod changed **actual state**, but it did not change the Deployment's desired state.

The Deployment still says, in effect:

```yaml
spec:
  replicas: 3
```

Kubernetes therefore sees:

```text
desired replicas: 3
actual replicas:  2
```

and reconciles the difference:

```text
desired: 3
    |
    v
observe: 2
    |
    v
difference: -1
    |
    v
create another Pod
    |
    v
actual: 3
```

This is why Kubernetes applications should normally be designed around replaceable workloads rather than individual machines or individual containers.

## There is more than one controller involved

We have simplified the story slightly.

A Deployment does not directly create Pods.

The relationship is approximately:

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

The Deployment controller manages ReplicaSets.

The ReplicaSet controller makes sure the correct number of matching Pods exists.

See the hierarchy:

```bash
kubectl get deployment api
kubectl get replicasets
kubectl get pods -l app=api
```

Inspect Pod ownership:

```bash
kubectl get pods \
  -l app=api \
  -o custom-columns='POD:.metadata.name,OWNER:.metadata.ownerReferences[0].name'
```

Do not worry about memorising ReplicaSets yet.

For now, remember the pattern:

```text
declare
   |
   v
observe
   |
   v
compare
   |
   v
reconcile
   |
   +------ repeat
```

That pattern is Kubernetes.

## How do we know the controller saw our change?

Many controller-managed objects expose another useful pair of fields.

```bash
kubectl get deployment api \
  -o jsonpath='{.metadata.generation}{" desired generation, "}{.status.observedGeneration}{" observed generation\n"}'
```

`metadata.generation` changes when the desired configuration changes.

`status.observedGeneration` tells us which generation the controller has observed.

You do not need to memorise those fields yet.

The useful idea is that Kubernetes APIs can expose both:

```text
what was requested
```

and:

```text
how far the controller has progressed towards it
```

That becomes very useful when debugging.

## Useful detour: talk to the application

We know nginx is running.

Prove it with a local port-forward:

```bash
kubectl port-forward deployment/api 8080:80
```

In another terminal:

```bash
curl http://127.0.0.1:8080
```

You should receive nginx's HTML response.

`kubectl port-forward` is extremely useful while developing and debugging because it creates a temporary tunnel from your machine to a workload in the cluster.

It is **not** application networking.

```text
your laptop
    |
localhost:8080
    |
 kubectl
    |
API server
    |
    v
   Pod
```

When the command stops, the tunnel stops.

Later we will create a **Service**, which solves a different problem: giving replaceable Pods a stable network identity inside Kubernetes.

## What to keep from this chapter

Do not memorise the commands yet.

Remember the model:

```text
spec
 |
 | what should exist
 v
controller
 |
 | continuously reconciles
 v
actual state
 |
 | reported back as
 v
status
```

Changing `spec` changes your intent.

Changing reality without changing `spec` causes Kubernetes to try to repair reality.

Almost everything else in this cookbook builds on that idea.
