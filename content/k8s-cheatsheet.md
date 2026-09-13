# Kubernetes for Application Developers

A runnable Kubernetes cookbook for application developers and CKAD candidates.

The goal is not to memorise YAML, we're going to build a mental model of Kubernetes, use the API deliberately, observe what the control plane did, break things on purpose, and work out why they broke.

**Target:** Kubernetes 1.35 and the current CKAD curriculum.

Sections are marked:

- **[CKAD]** - directly relevant to CKAD
- **[DEV]** - practical application developer knowledge
- **[DEEP DIVE]** - controllers, operators and platform engineering

This cookbook is intentionally cumulative. We will keep reusing the same resources so that later concepts explain earlier behaviour rather than appearing as unrelated YAML fragments.

The recurring teaching loop is:

```text
problem
  |
  v
mental model
  |
  v
small experiment
  |
  v
observe Kubernetes
  |
  v
change one thing
  |
  v
observe the consequence
  |
  v
break an assumption
  |
  v
explain why
```

When a section does not need every step, we will not force it into a template.

---

# Part I - Learn the Control Loop

# 0. Lab Setup [CKAD]

Use one namespace for the whole cookbook so that commands stay short and cleanup is easy.

```bash
kubectl create namespace cookbook
```

Make it the default namespace for the current context:

```bash
kubectl config set-context \
  --current \
  --namespace=cookbook
```

Check:

```bash
kubectl config view --minify \
  -o jsonpath='{..namespace}{"\n"}'
```

Expected:

```text
cookbook
```

Check that the cluster is reachable:

```bash
kubectl version
kubectl get nodes
```

Useful throughout the cookbook:

```bash
kubectl get all
```

Despite the name, `all` does **not** mean every Kubernetes API resource.

For actual API discovery:

```bash
kubectl api-resources
```

## A note about the lab

Most examples work on any ordinary Kubernetes cluster.

A few exercises depend on optional cluster capabilities:

- PersistentVolumeClaims need a storage provisioner or an existing PersistentVolume.
- NetworkPolicy enforcement needs a CNI that implements NetworkPolicy.
- Ingress routing needs an Ingress controller.
- CRD exercises need permission to create cluster-scoped CustomResourceDefinitions.

When one of those assumptions matters, the recipe will say so.

---

# 1. The Kubernetes Control Loop [CKAD] [DEV]

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

---

# 2. API Objects and Changing Desired State [CKAD] [DEV]

The previous chapter used commands such as:

```bash
kubectl create deployment ...
kubectl scale deployment ...
```

It is tempting to think of those as special operations implemented by Kubernetes.

A better mental model is:

> `kubectl` is mostly a client for the Kubernetes API.

Different commands give us different ways to create or modify API objects.

## The common shape of a Kubernetes object

Most manifests have the same top-level structure:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: example
spec:
  replicas: 3
```

Think:

```text
apiVersion -> which API schema?
kind       -> what type of object?
metadata   -> which object?
spec       -> what do I want?
status     -> what does Kubernetes observe?
```

`status` is normally omitted from manifests you write.

Controllers populate it after the object exists.

## Ask Kubernetes for the object we already created

```bash
kubectl get deployment api -o yaml
```

There is a lot of output.

Do not try to read it all.

Find these areas:

```text
metadata:
spec:
status:
```

The object in the API is richer than the small amount of configuration we initially supplied because Kubernetes defaults fields and controllers add status.

## Generate YAML instead of writing it from memory

Generate a Deployment manifest without creating anything:

```bash
kubectl create deployment generated \
  --image=nginx:1.27-alpine \
  --replicas=2 \
  --dry-run=client \
  -o yaml
```

Save it:

```bash
kubectl create deployment generated \
  --image=nginx:1.27-alpine \
  --replicas=2 \
  --dry-run=client \
  -o yaml > generated.yaml
```

Now the manifest is editable source rather than something you had to remember from scratch.

## Several commands, one underlying idea

These commands look different:

```text
kubectl scale
kubectl set image
kubectl edit
kubectl patch
kubectl apply
```

But they all ultimately modify desired state stored in the API.

### `kubectl scale`

Purpose-built mutation:

```bash
kubectl scale deployment api --replicas=4
```

It changes:

```text
.spec.replicas
```

Return to three replicas:

```bash
kubectl scale deployment api --replicas=3
```

### `kubectl set image`

Another purpose-built mutation:

```bash
kubectl set image deployment/api \
  nginx=nginx:1.27-alpine
```

It changes the container image in the Deployment's Pod template.

### `kubectl edit`

Open the live object in an editor:

```bash
kubectl edit deployment api
```

Useful during an exam or incident.

Less useful as a repeatable deployment process because the change only exists as an API mutation unless you also update your source manifest.

### `kubectl patch`

Change a small part of an object without rewriting the whole manifest:

```bash
kubectl patch deployment api \
  --type=merge \
  -p '{"spec":{"replicas":2}}'
```

Check:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.replicas}{"\n"}'
```

Then restore:

```bash
kubectl scale deployment api --replicas=3
```

### `kubectl apply`

`apply` is the usual declarative workflow.

You keep the desired configuration in a file and ask Kubernetes to make the live object agree with it.

For example:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: declarative-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: declarative-demo
  template:
    metadata:
      labels:
        app: declarative-demo
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
```

Save as `declarative-demo.yaml` and apply:

```bash
kubectl apply -f declarative-demo.yaml
```

Change:

```yaml
replicas: 2
```

Apply again:

```bash
kubectl apply -f declarative-demo.yaml
```

Observe:

```bash
kubectl get deployment declarative-demo
```

Cleanup:

```bash
kubectl delete -f declarative-demo.yaml
rm -f declarative-demo.yaml generated.yaml
```

## Imperative and declarative are not opposing religions

For application developers, both are useful.

Imperative commands are excellent for:

- exploration
- debugging
- CKAD speed
- one-off mutations
- generating starter YAML

Declarative files are excellent for:

- review
- version control
- repeatability
- GitOps
- production change management

The important thing is understanding **what API field you are changing and why**.

---

# 3. API Discovery and Querying [CKAD]

Kubernetes has a large API.

Do not guess resource names or YAML fields when the cluster can tell you.

## Discover resource types

```bash
kubectl api-resources
```

Find Deployments:

```bash
kubectl api-resources | grep -i deployment
```

You should see the `apps` API group.

Check supported API versions:

```bash
kubectl api-versions
```

## Ask for the schema

```bash
kubectl explain deployment
```

Dig deeper:

```bash
kubectl explain deployment.spec
kubectl explain deployment.spec.template
kubectl explain deployment.spec.template.spec.containers
```

For Pods:

```bash
kubectl explain pod.spec.containers.resources
```

This is usually faster and safer than guessing YAML.

## Query individual fields

Deployment name:

```bash
kubectl get deployment api \
  -o jsonpath='{.metadata.name}{"\n"}'
```

Desired replicas:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.replicas}{"\n"}'
```

Ready replicas:

```bash
kubectl get deployment api \
  -o jsonpath='{.status.readyReplicas}{"\n"}'
```

Container image:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Pod IPs:

```bash
kubectl get pods \
  -l app=api \
  -o custom-columns='NAME:.metadata.name,IP:.status.podIP'
```

This is querying the Kubernetes API.

It is not executing commands inside a container.

## Learn to switch output formats

Human summary:

```bash
kubectl get pods
```

More columns:

```bash
kubectl get pods -o wide
```

Full object:

```bash
kubectl get pod <pod-name> -o yaml
```

JSON:

```bash
kubectl get pod <pod-name> -o json
```

Selected fields:

```bash
kubectl get pods \
  -o custom-columns='NAME:.metadata.name,PHASE:.status.phase,NODE:.spec.nodeName'
```

A strong Kubernetes workflow is often:

```text
get
 |
 v
describe
 |
 v
query exact fields
 |
 v
logs/events when needed
```

---

# Part II - Pods and Workload Controllers

# 4. Pods: The Unit Kubernetes Schedules [CKAD]

A Pod is the smallest workload Kubernetes schedules onto a node.

A Pod contains one or more containers that share:

- an IP address
- a network namespace
- `localhost`
- optional volumes
- scheduling fate

The most important practical property is this:

> Pods are replaceable.

Do not treat a Pod name or Pod IP as a durable application endpoint.

## The container image is an input to Kubernetes

Kubernetes schedules and runs container images; it does not normally build your application image for you.

A minimal image definition might look like:

```dockerfile
FROM nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/index.html
```

Build it with an OCI-compatible image tool such as Docker or Podman:

```bash
docker build -t example/web:v1 .
```

or:

```bash
podman build -t example/web:v1 .
```

The cluster then needs to be able to pull or otherwise access that image. In a real workflow that usually means pushing it to a registry the cluster can reach.

The Pod spec references the resulting image:

```yaml
spec:
  containers:
    - name: web
      image: example/web:v1
```

Keep the responsibility boundary clear:

```text
Dockerfile / Containerfile
      |
      v
build an OCI image
      |
      v
registry / cluster image store
      |
      v
Pod spec references image
      |
      v
kubelet asks container runtime to run it
```

Most exercises use public images so we can concentrate on Kubernetes itself. In Chapter 9 we will deliberately build our own image and discover what “the cluster needs to be able to access that image” actually means.

## Create a standalone Pod

The Deployment from Chapter 1 is controller-managed.

Create a separate Pod so we can inspect Pod behaviour without a controller replacing it:

```bash
kubectl run pod-lab \
  --image=nginx:1.27-alpine \
  --restart=Never \
  --labels=app=pod-lab
```

Observe:

```bash
kubectl get pod pod-lab
kubectl get pod pod-lab -o wide
```

## `describe` connects configuration to runtime events

```bash
kubectl describe pod pod-lab
```

Pay attention to:

```text
Node
IP
Containers
Conditions
Events
```

`get -o yaml` gives the complete API object.

`describe` gives a human-oriented operational summary.

Both are useful for different reasons.

## Logs are container output

```bash
kubectl logs pod-lab
```

NGINX may have little to show until it receives traffic.

Port-forward temporarily:

```bash
kubectl port-forward pod/pod-lab 8081:80
```

In another terminal:

```bash
curl http://127.0.0.1:8081
```

Now check logs again:

```bash
kubectl logs pod-lab
```

## `exec` runs a process inside the existing container

```bash
kubectl exec pod-lab -- nginx -v
```

Try:

```bash
kubectl exec pod-lab -- ps
```

For an interactive shell:

```bash
kubectl exec -it pod-lab -- sh
```

Exit with:

```text
exit
```

## Container `command` and `args`

Kubernetes can override an image's configured entrypoint and arguments.

A rough mapping is:

```text
container image ENTRYPOINT -> command
container image CMD        -> args
```

Example:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: command-demo
spec:
  restartPolicy: Never
  containers:
    - name: shell
      image: busybox:1.36
      command: ["sh", "-c"]
      args:
        - echo "hello from command-demo"; sleep 30
```

Apply:

```bash
kubectl apply -f command-demo.yaml
```

Logs:

```bash
kubectl logs command-demo
```

Cleanup:

```bash
kubectl delete pod command-demo --ignore-not-found
```

## What happens without a controller?

Delete the standalone Pod:

```bash
kubectl delete pod pod-lab
```

Then:

```bash
kubectl get pod pod-lab
```

It is gone.

No controller declared that `pod-lab` should continue to exist.

Compare that with deleting one of the `api` Deployment Pods: the controller recreates it.

That difference is why production applications are normally managed by workload controllers rather than naked Pods.

---

# 5. Labels, Selectors and Annotations [CKAD]

Kubernetes needs a way for independent API objects to find groups of other objects.

It uses **labels** and **selectors** heavily for this.

Labels are small key/value identifiers such as:

```text
app=api
environment=dev
release=stable
```

## See the labels on our application

```bash
kubectl get pods -l app=api --show-labels
```

The Deployment's Pod template contains:

```yaml
metadata:
  labels:
    app: api
```

The ReplicaSet creates Pods carrying those labels.

## Create some disposable labelled Pods

```bash
kubectl run label-a \
  --image=busybox:1.36 \
  --restart=Never \
  --labels='app=demo,environment=dev' \
  --command -- sleep 3600

kubectl run label-b \
  --image=busybox:1.36 \
  --restart=Never \
  --labels='app=demo,environment=test' \
  --command -- sleep 3600
```

Select both:

```bash
kubectl get pods -l app=demo
```

Select only dev:

```bash
kubectl get pods -l app=demo,environment=dev
```

Set-based selector:

```bash
kubectl get pods -l 'environment in (dev,test)'
```

Change a label:

```bash
kubectl label pod label-a environment=test --overwrite
```

Now:

```bash
kubectl get pods -l environment=dev
kubectl get pods -l environment=test
```

## Why selectors matter

Selectors connect otherwise independent resources.

Later we will see:

```text
Service selector
      |
      v
matching Pod labels
```

and:

```text
ReplicaSet selector
      |
      v
matching Pod labels
```

A selector mismatch is therefore not cosmetic.

It changes behaviour.

## Annotations are different

Annotations are metadata that is not normally used for selection.

Example:

```bash
kubectl annotate pod label-a \
  example.com/description='temporary label experiment'
```

Inspect:

```bash
kubectl get pod label-a \
  -o jsonpath='{.metadata.annotations}{"\n"}'
```

Think:

```text
labels      -> identity and selection
annotations -> additional metadata
```

Cleanup:

```bash
kubectl delete pod label-a label-b
```

---

# 6. Requests, Limits and Scheduling [CKAD]

A container image tells Kubernetes **what to run**.

The scheduler also needs to know **what resources it needs**.

That is where requests and limits enter.

A useful first approximation is:

```text
request -> capacity considered when scheduling me
limit   -> runtime ceiling imposed on me
```

CPU and memory behave differently when a limit is exceeded:

- CPU is throttled.
- Memory can result in the container being OOM-killed.

## Create a Pod with resource requirements

Save as `limited.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: limited
spec:
  containers:
    - name: web
      image: nginx:1.27-alpine
      resources:
        requests:
          cpu: 100m
          memory: 64Mi
        limits:
          cpu: 500m
          memory: 128Mi
```

Apply:

```bash
kubectl apply -f limited.yaml
```

Inspect:

```bash
kubectl describe pod limited
```

Or query exactly what you asked for:

```bash
kubectl get pod limited \
  -o jsonpath='{.spec.containers[0].resources}{"\n"}'
```

If Metrics Server exists:

```bash
kubectl top pod limited
```

## Break scheduling on purpose

The scheduler cannot place a Pod whose resource request cannot be satisfied by any eligible node.

Save as `unschedulable.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: unschedulable
spec:
  containers:
    - name: sleeper
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      resources:
        requests:
          memory: 1000Gi
```

Apply:

```bash
kubectl apply -f unschedulable.yaml
```

Observe:

```bash
kubectl get pod unschedulable
```

It should remain `Pending`.

Ask why:

```bash
kubectl describe pod unschedulable
```

Look at the Events section.

The useful debugging lesson is:

```text
Pending Pod
   |
   v
scheduler could not bind it to a node
   |
   v
inspect scheduling events
```

Cleanup:

```bash
kubectl delete pod limited unschedulable
rm -f limited.yaml unschedulable.yaml
```

## ResourceQuota and LimitRange

Requests and limits are workload configuration.

Namespaces can also have policy around resource consumption.

Inspect any existing quota:

```bash
kubectl get resourcequota
kubectl get limitrange
```

A `ResourceQuota` can cap aggregate namespace consumption.

A `LimitRange` can constrain or default per-container or per-Pod values.

You do not need to confuse these with requests and limits:

```text
request / limit -> what this workload asks for
LimitRange      -> policy/defaults around individual workloads
ResourceQuota   -> aggregate namespace budget
```

---

# 7. Deployments and ReplicaSets [CKAD]

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

---

# 8. Rolling Updates, Revisions and Rollback [CKAD]

Suppose we want a new application version.

Replacing every Pod at once would create unnecessary downtime.

A Deployment can instead progressively move from one ReplicaSet to another.

## Check the current image

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

## Change the Pod template

```bash
kubectl set image deployment/api \
  nginx=nginx:1.28-alpine
```

Watch rollout progress:

```bash
kubectl rollout status deployment/api
```

Inspect ReplicaSets:

```bash
kubectl get rs -l app=api
```

You should now see an older ReplicaSet and a newer one.

Why did Kubernetes create a new ReplicaSet this time but not when we scaled?

Because the Pod template changed.

```text
change .spec.replicas
      |
      v
same Pod template
      |
      v
same Deployment revision

change .spec.template
      |
      v
new desired Pod definition
      |
      v
new ReplicaSet / revision
```

## Rollout history

```bash
kubectl rollout history deployment/api
```

## Roll back

```bash
kubectl rollout undo deployment/api
```

Watch:

```bash
kubectl rollout status deployment/api
```

Check the image again:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

## RollingUpdate strategy

Inspect the strategy:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.strategy}{"\n"}'
```

And ask the schema what the fields mean:

```bash
kubectl explain deployment.spec.strategy
kubectl explain deployment.spec.strategy.rollingUpdate
```

The two important controls are:

```text
maxUnavailable -> how many desired replicas may be unavailable
maxSurge       -> how many extra replicas may exist during rollout
```

Do not memorise defaults when `kubectl explain` can tell you what the current API supports.

---

# 9a. Break a Deployment and Debug the Rollout [CKAD] [DEV]

A failed rollout is more educational than a successful one.

Deploy an image that does not exist:

```bash
kubectl set image deployment/api \
  nginx=nginx:this-tag-does-not-exist
```

Watch Pods:

```bash
kubectl get pods -l app=api
```

You should see a new Pod eventually enter an image pull backoff state.

Do not just memorise `ImagePullBackOff`.

Follow the object chain.

## Is the Deployment healthy?

```bash
kubectl get deployment api
```

Try waiting for the rollout, but use a short timeout so the lab does not wait for the Deployment's full progress deadline:

```bash
kubectl rollout status deployment/api --timeout=30s
```

## Which ReplicaSet is new?

```bash
kubectl get rs -l app=api
```

## Which Pod is failing?

```bash
kubectl get pods -l app=api
```

Pick the failing Pod:

```bash
kubectl describe pod <failing-pod>
```

The Events section should explain the image pull failure.

Cluster events can also help:

```bash
kubectl get events \
  --sort-by=.metadata.creationTimestamp
```

The debugging chain was:

```text
Deployment
    |
    v
ReplicaSet
    |
    v
Pod
    |
    v
container image
    |
    v
image pull event
```

## Fix the desired state

Undo the bad revision:

```bash
kubectl rollout undo deployment/api
```

Verify:

```bash
kubectl rollout status deployment/api
kubectl get pods -l app=api
```

This is the reconciliation model again.

We did not repair individual broken Pods.

We corrected desired state and let Kubernetes converge.

9b Sidequest: Build Your Own Image and Debug a Failed Rollout [CKAD] [DEV]

So far we have used images that already exist in a public registry.

That hides an important part of the application lifecycle:

```text
source
  |
  v
build image
  |
  v
make image available to cluster
  |
  v
change desired state
  |
  v
Kubernetes rolls it out
```

Let's build an image ourselves.

This will also give us a much more realistic failure to debug.

## Build a tiny application image

Create a temporary working directory:

```bash
mkdir -p /tmp/k8s-web
cd /tmp/k8s-web
```

Create a simple page:

```bash
cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <h1>Hello from our own image</h1>
    <p>version: v1</p>
  </body>
</html>
EOF
```

Create a `Dockerfile`:

```bash
cat > Dockerfile <<'EOF'
FROM nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/index.html
EOF
```

Build it:

```bash
docker build -t example/web:v1 .
```

Check that Docker knows about it:

```bash
docker image inspect example/web:v1 \
  --format '{{.RepoTags}}'
```

We now have:

```text
source files
    |
    v
docker build
    |
    v
example/web:v1
```

But where does that image actually exist?

For now:

```text
your local Docker image store
```

That distinction will matter shortly.

---

## Change the Deployment to use our image

Before changing anything, inspect the containers in the Deployment:

```bash
kubectl get deployment api \
  -o jsonpath='{range .spec.template.spec.containers[*]}{.name}{" -> "}{.image}{"\n"}{end}'
```

You should see something similar to:

```text
nginx -> nginx:1.27-alpine
```

There are three different names involved here:

```text
Deployment name: api

container name:  nginx

image name:      nginx:1.27-alpine
```

They are not interchangeable.

`kubectl set image` uses:

```text
kubectl set image <resource> <container-name>=<image>
```

So change the `nginx` container to our new image:

```bash
kubectl set image deployment/api \
  nginx=example/web:v1
```

This modifies:

```text
.spec.template.spec.containers[0].image
```

It does **not** reach into the existing Pods and replace their containers.

We changed the desired Pod template.

That means the Deployment controller must perform another rollout.

---

## Watch what happens

In one terminal:

```bash
kubectl get pods -w
```

You may see something like:

```text
NAME                  READY   STATUS             RESTARTS
api-6645d7d87-24nw7   1/1     Running            0
api-6645d7d87-6wbjr   1/1     Running            0
api-6645d7d87-wcwpx   1/1     Running            0
api-8fc59985f-4nhhm   0/1     ErrImagePull       0
api-8fc59985f-4nhhm   0/1     ImagePullBackOff   0
```

Interesting.

We asked for a new image.

Kubernetes created a new Pod.

But the Pod cannot start.

Before fixing it, inspect what Kubernetes has done.

---

## Follow the rollout through its objects

Look at the Deployment:

```bash
kubectl get deployment api
```

Then its ReplicaSets:

```bash
kubectl get rs -l app=api
```

And its Pods:

```bash
kubectl get pods -l app=api
```

You should now have two ReplicaSets.

Conceptually:

```text
Deployment api
    |
    +-- old ReplicaSet
    |      |
    |      +-- Running Pod
    |      +-- Running Pod
    |      +-- Running Pod
    |
    +-- new ReplicaSet
           |
           +-- ImagePullBackOff
```

The different hashes in the Pod names identify the ReplicaSet templates:

```text
api-6645d7d87-xxxxx
    ^^^^^^^^^

api-8fc59985f-yyyyy
    ^^^^^^^^^
```

A new Pod template caused Kubernetes to create a new ReplicaSet.

---

## Why are the old Pods still running?

This is an important property of a rolling Deployment.

Inspect the strategy:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.strategy}{"\n"}'
```

A Deployment normally uses a `RollingUpdate`.

The two important controls are:

```text
maxSurge
maxUnavailable
```

With three replicas and the default percentage-based strategy, Kubernetes can effectively create one additional Pod while keeping the existing three available.

So we currently have something like:

```text
desired replicas:       3

old ready replicas:     3
new attempted replicas: 1
new ready replicas:     0

total Pods:              4
```

The new version is broken.

Kubernetes therefore does **not** eagerly destroy all three working Pods.

The rollout has stalled while the old application remains available.

This is reconciliation doing something more subtle than:

```text
3 desired == 3 running
```

Our desired state now includes both:

```text
replicas: 3
```

and:

```text
image: example/web:v1
```

Reality currently satisfies the first requirement but not the second.

---

## Ask the failing Pod why

Find the failing Pod:

```bash
kubectl get pods -l app=api
```

Describe it:

```bash
kubectl describe pod <failing-pod-name>
```

Go to the **Events** section at the bottom.

You should see messages explaining that Kubernetes could not pull:

```text
example/web:v1
```

You can also inspect recent cluster events:

```bash
kubectl get events \
  --sort-by=.metadata.creationTimestamp
```

The Pod status is telling us the symptom:

```text
ImagePullBackOff
```

The Events explain the cause.

This is a useful debugging habit:

```text
get
 |
 v
find unhealthy object
 |
 v
describe
 |
 v
read Events
```

---

## `ErrImagePull` and `ImagePullBackOff`

You may see the Pod alternate between:

```text
ErrImagePull
```

and:

```text
ImagePullBackOff
```

These describe related stages of the same problem.

Roughly:

```text
try to obtain image
       |
       v
pull fails
       |
       v
ErrImagePull
       |
       v
wait before retrying
       |
       v
ImagePullBackOff
       |
       v
retry later
```

The backoff prevents the kubelet from continuously hammering an unavailable registry.

But why is Kubernetes trying to pull the image at all?

We just built it.

---

## Your Docker image store is not the Kubernetes node

Check the current context:

```bash
kubectl config current-context
```

For this cookbook's kind cluster it should be:

```text
kind-ckad
```

`kind` means **Kubernetes IN Docker**.

The Kubernetes node itself runs as a container and uses its own container runtime.

Our image currently exists here:

```text
Docker on your machine
        |
        +-- example/web:v1
```

But the kubelet is running here:

```text
kind node
    |
    v
container runtime
```

Those are not the same image store.

Conceptually:

```text
Mac / Linux host
|
+-- Docker image store
|      |
|      +-- example/web:v1
|
+-- kind node container
       |
       +-- containerd image store
              |
              +-- image is missing
```

When the node cannot find the requested image locally, it attempts to obtain it from a registry.

Our image name is:

```text
example/web:v1
```

but we never pushed that image to a registry.

So the pull fails.

This is an important boundary:

> Building an image successfully does not automatically make that image available to every Kubernetes node.

In production, image distribution normally looks like:

```text
developer / CI
      |
      v
docker build
      |
      v
container registry
      |
      v
Kubernetes nodes pull image
```

For our local kind lab, we can skip running a registry and load the image directly into the node.

---

## Load the image into kind

Our kind cluster is named `ckad`.

Load the image:

```bash
kind load docker-image example/web:v1 \
  --name ckad
```

Now the relationship is:

```text
Docker image store
    |
    | kind load docker-image
    v
kind node image store
    |
    v
kubelet can run example/web:v1
```

Kubernetes may eventually retry the failed Pod by itself.

If you want to observe reconciliation immediately, delete the failing Pod:

```bash
kubectl delete pod <failing-pod-name>
```

Do **not** change the Deployment.

Watch:

```bash
kubectl get pods -l app=api -w
```

The ReplicaSet still says that a Pod matching the new template should exist.

Deleting the failed Pod therefore causes another to be created.

This time the node can find:

```text
example/web:v1
```

locally.

The container should start.

---

## Watch the rollout recover

Now run:

```bash
kubectl rollout status deployment/api
```

You should see the rollout complete.

Inspect everything together:

```bash
kubectl get deployment,rs,pods -l app=api
```

Eventually the new ReplicaSet should own all three active Pods and the old ReplicaSet should have zero desired replicas.

Conceptually:

```text
before
------

old ReplicaSet
+-- old Pod
+-- old Pod
+-- old Pod

new ReplicaSet
+-- broken Pod


after image becomes available
-----------------------------

old ReplicaSet
+-- scaled to zero

new ReplicaSet
+-- new Pod
+-- new Pod
+-- new Pod
```

The Deployment controller did not need to be restarted.

The ReplicaSet did not need to be recreated manually.

We fixed the condition preventing Kubernetes from satisfying the existing desired state, and reconciliation continued.

---

## Prove that our application is running

Port-forward the Deployment:

```bash
kubectl port-forward deployment/api 8080:80
```

In another terminal:

```bash
curl http://127.0.0.1:8080
```

You should see:

```html
<!doctype html>
<html>
  <body>
    <h1>Hello from our own image</h1>
    <p>version: v1</p>
  </body>
</html>
```

We have now travelled through the complete application path:

```text
source code
    |
    v
Dockerfile
    |
    v
docker build
    |
    v
OCI image
    |
    v
kind load
    |
    v
node image store
    |
    v
Deployment Pod template
    |
    v
new ReplicaSet
    |
    v
new Pods
    |
    v
running application
```

---

## Make a v2

Now that we understand the path, repeat it deliberately.

Change the page:

```bash
cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <h1>Hello from our own image</h1>
    <p>version: v2</p>
  </body>
</html>
EOF
```

Build a **new tag**:

```bash
docker build -t example/web:v2 .
```

Load it:

```bash
kind load docker-image example/web:v2 \
  --name ckad
```

Then change desired state:

```bash
kubectl set image deployment/api \
  nginx=example/web:v2
```

Watch:

```bash
kubectl rollout status deployment/api
```

Verify:

```bash
kubectl port-forward deployment/api 8080:80
```

Then from another terminal:

```bash
curl http://127.0.0.1:8080
```

You should now see:

```text
version: v2
```

Notice the order:

```text
build
  |
  v
make image available
  |
  v
change desired state
  |
  v
roll out
```

The first time we accidentally did:

```text
build
  |
  v
change desired state
  |
  v
Kubernetes cannot obtain image
  |
  v
failed rollout
```

Both were useful.

The failure exposed a boundary that the successful path would otherwise have hidden.

---

## Why use a new image tag?

It is tempting during local development to repeatedly rebuild:

```text
example/web:v1
```

with different contents.

Avoid using mutable tags while learning this workflow.

Prefer:

```text
example/web:v1
example/web:v2
example/web:v3
```

Then the image reference itself tells us which version the Deployment requested.

That makes debugging much easier:

```text
desired image
      |
      v
example/web:v2
```

rather than having several different images all claiming to be:

```text
example/web:v1
```

Production systems often go further and deploy images by immutable digest.

For now, unique version tags are enough to make the important idea clear.

---

## What this sidequest taught us

We started by trying to deploy our own web page.

Along the way we encountered several Kubernetes concepts naturally:

```text
Deployment name != container name != image name
```

```text
changing the image
      |
      v
changes the Pod template
      |
      v
creates a new ReplicaSet
      |
      v
starts a rolling update
```

```text
docker build
      |
      v
local image exists

does NOT imply

Kubernetes node can access image
```

```text
failed new Pod
      |
      v
old healthy Pods remain available
```

and:

```text
Pod status
   +
Events
   +
ownership chain
   |
   v
explain why reconciliation is stuck
```

Most importantly, Kubernetes was doing exactly what we asked throughout.

The failure was not that reconciliation stopped.

The controller continued trying to make actual state match desired state.

It simply could not satisfy one of the inputs:

```text
image: example/web:v1
```

Once that image became available to the node, the system could converge.

That is the control loop again.


---

# Part III - Stable Networking for Replaceable Pods

# 10. Services: Stable Identity for Replaceable Pods [CKAD]

Our Deployment Pods are intentionally disposable.

That creates a networking problem.

A Pod can disappear and its replacement can have a different IP address.

Clients therefore need something more stable than a Pod IP.

A **Service** provides a stable virtual endpoint over a selected set of backends.

Conceptually:

```text
Client
  |
  v
Service
  |
  v
EndpointSlice
  |
  +-- Pod
  +-- Pod
  +-- Pod
```

## Expose the Deployment

```bash
kubectl expose deployment api \
  --name=api \
  --port=80 \
  --target-port=80
```

Inspect:

```bash
kubectl get service api
kubectl describe service api
```

The important distinction is:

```text
port       -> port clients use on the Service
targetPort -> port the application receives traffic on
```

## How does the Service find Pods?

Query its selector:

```bash
kubectl get service api \
  -o jsonpath='{.spec.selector}{"\n"}'
```

You should see something equivalent to:

```text
map[app:api]
```

Check matching Pods:

```bash
kubectl get pods -l app=api --show-labels
```

The Service does not contain a permanent list of those Pod IPs.

It declares a selector.

Another controller continuously maintains the backend endpoint data.

There is our reconciliation model again.

---

# 11. EndpointSlices and DNS [CKAD] [DEV]

A common simplified drawing is:

```text
Service -> Pods
```

Useful, but incomplete.

For Services with selectors, Kubernetes normally maintains **EndpointSlices** containing matching backend endpoints.

## Inspect EndpointSlices

```bash
kubectl get endpointslices
```

Filter for our Service:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api
```

Show addresses:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api \
  -o jsonpath='{.items[*].endpoints[*].addresses[*]}{"\n"}'
```

Compare with Pod IPs:

```bash
kubectl get pods \
  -l app=api \
  -o custom-columns='NAME:.metadata.name,IP:.status.podIP'
```

The addresses should correspond.

The relationship is closer to:

```text
Service selector
      |
      v
matching Pods
      |
      v
EndpointSlice controller
      |
      v
EndpointSlices
      |
      v
networking implementation
```

## Create a client Pod

We need something inside the cluster to test cluster networking.

```bash
kubectl run client \
  --image=busybox:1.36 \
  --restart=Never \
  --labels=app=client \
  --command -- sleep 3600
```

Wait until it is ready:

```bash
kubectl wait \
  --for=condition=Ready \
  pod/client \
  --timeout=60s
```

## Service DNS

Resolve the Service:

```bash
kubectl exec client -- nslookup api
```

Call it:

```bash
kubectl exec client -- wget -qO- http://api
```

Try the namespace-qualified name:

```bash
kubectl exec client -- \
  wget -qO- http://api.cookbook
```

A conventional fully qualified Service name is:

```text
api.cookbook.svc.cluster.local
```

You normally use the shortest name that is unambiguous.

Inside the same namespace:

```text
api
```

is usually enough.

## Compare Service and port-forward

A Service is persistent cluster configuration:

```text
Pod replacement
     |
     v
endpoint set changes
     |
     v
Service identity remains
```

A port-forward is a temporary developer/debug tunnel.

Do not confuse them.

---

# 12. Break a Service and Follow the Network Path [CKAD]

Now deliberately break the selector.

First prove the application works:

```bash
kubectl exec client -- wget -qO- http://api
```

Inspect current endpoints:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api
```

## Break the selector

```bash
kubectl patch service api \
  --type=merge \
  -p '{"spec":{"selector":{"app":"broken"}}}'
```

Now ask for endpoint addresses:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api \
  -o jsonpath='{.items[*].endpoints[*].addresses[*]}{"\n"}'
```

Try the request:

```bash
kubectl exec client -- \
  wget -T 2 -qO- http://api
```

It should fail.

Why?

```text
Service selector = app=broken

Pods = app=api

No match
   |
   v
No ready backend endpoints
```

## Fix desired state

```bash
kubectl patch service api \
  --type=merge \
  -p '{"spec":{"selector":{"app":"api"}}}'
```

Verify:

```bash
kubectl exec client -- wget -qO- http://api
```

## A useful Service debugging order

When DNS resolves but traffic fails, walk the path rather than trying random commands:

```text
Service
  |
  | selector and ports correct?
  v
Pod labels
  |
  | selector matches?
  v
EndpointSlice
  |
  | ready addresses present?
  v
Pod readiness
  |
  | endpoint considered ready?
  v
application port
  |
  | process actually listening?
  v
application
```

We will revisit this after adding readiness probes.

---

# Part IV - Configuration and Health

# 13. ConfigMaps: Configuration Without Rebuilding the Image [CKAD]

Our nginx image contains its default page.

Suppose application content or configuration needs to vary between environments.

Rebuilding an image for every small configuration change is often the wrong abstraction.

A ConfigMap stores non-secret configuration in the Kubernetes API.

## Create configuration

```bash
kubectl create configmap api-content \
  --from-literal=index.html='hello from kubernetes'
```

Inspect:

```bash
kubectl get configmap api-content -o yaml
```

Query only the value:

```bash
kubectl get configmap api-content \
  -o jsonpath='{.data.index\.html}{"\n"}'
```

## Mount the ConfigMap into the application

Patch the Deployment:

```bash
kubectl patch deployment api --type=strategic -p '
spec:
  template:
    spec:
      containers:
        - name: nginx
          volumeMounts:
            - name: content
              mountPath: /usr/share/nginx/html
      volumes:
        - name: content
          configMap:
            name: api-content
'
```

Because `.spec.template` changed, this creates a new Deployment revision.

Wait:

```bash
kubectl rollout status deployment/api
```

Call the Service:

```bash
kubectl exec client -- wget -qO- http://api
```

Expected:

```text
hello from kubernetes
```

You have connected:

```text
ConfigMap
    |
    v
Volume
    |
    v
Pod filesystem
    |
    v
Application
```

## Change configuration

Update the ConfigMap declaratively from an imperative generator:

```bash
kubectl create configmap api-content \
  --from-literal=index.html='configuration changed' \
  --dry-run=client \
  -o yaml | kubectl apply -f -
```

ConfigMap-backed volumes are eventually updated by the kubelet.

After a short delay, retry:

```bash
kubectl exec client -- wget -qO- http://api
```

You should eventually see:

```text
configuration changed
```

A subtle but important caveat:

> A ConfigMap mounted using `subPath` does not receive the normal projected-volume updates.

That is one reason this example mounts the ConfigMap as the directory rather than mounting one key with `subPath`.

## ConfigMap as environment variables

ConfigMaps can also populate environment variables.

The difference matters operationally:

```text
ConfigMap volume
    -> projected into filesystem
    -> updates can appear later

ConfigMap environment variable
    -> value captured when container starts
    -> Pod must be recreated to see a new value
```

---

# 14. Secrets: Sensitive Configuration [CKAD]

Some configuration is sensitive enough that it should not be mixed casually with ordinary ConfigMaps.

Kubernetes provides the `Secret` API type.

Create one:

```bash
kubectl create secret generic api-secret \
  --from-literal=username=developer \
  --from-literal=password=correct-horse
```

Inspect metadata:

```bash
kubectl get secret api-secret
```

View YAML:

```bash
kubectl get secret api-secret -o yaml
```

Values under `data` are base64 encoded.

Decode one:

```bash
kubectl get secret api-secret \
  -o jsonpath='{.data.username}' | base64 -d

echo
```

Base64 is **encoding, not encryption**.

The security value of a Secret comes from Kubernetes access controls and how the cluster protects Secret data, not from base64.

## `stringData`

Declarative Secrets can avoid manual base64 encoding:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: example-secret
type: Opaque
stringData:
  token: example-value
```

The API server converts `stringData` into the encoded `data` representation.

## Consume a Secret as an environment variable

Patch the Deployment:

```bash
kubectl patch deployment api --type=strategic -p '
spec:
  template:
    spec:
      containers:
        - name: nginx
          env:
            - name: API_USERNAME
              valueFrom:
                secretKeyRef:
                  name: api-secret
                  key: username
'
```

Wait for rollout:

```bash
kubectl rollout status deployment/api
```

Inspect one Pod:

```bash
POD=$(kubectl get pods -l app=api -o jsonpath='{.items[0].metadata.name}')
kubectl exec "$POD" -- printenv API_USERNAME
```

Expected:

```text
developer
```

Use real secret-management controls in production rather than committing plaintext Secret manifests to Git.

---

# 15. The Downward API: Let the Workload See Its Kubernetes Identity [CKAD]

Applications sometimes need metadata about the Pod they are running inside.

Hard-coding it would defeat the purpose of replaceable Pods.

The Downward API can expose selected Pod fields as environment variables or files.

Save as `downward.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: downward
  labels:
    app: downward-demo
spec:
  containers:
    - name: shell
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      env:
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        - name: POD_IP
          valueFrom:
            fieldRef:
              fieldPath: status.podIP
```

Apply:

```bash
kubectl apply -f downward.yaml
```

Query from inside the container:

```bash
kubectl exec downward -- printenv POD_NAME
kubectl exec downward -- printenv POD_NAMESPACE
kubectl exec downward -- printenv POD_IP
```

The application learned runtime identity from the platform rather than from a baked image or hand-written config file.

Cleanup:

```bash
kubectl delete pod downward
rm -f downward.yaml
```

---

# 16. Probes: Running Is Not the Same as Healthy [CKAD]

A process can exist without being useful.

Kubernetes therefore asks several different health questions.

## Readiness

> Should this Pod receive traffic right now?

A failed readiness probe does not normally restart the container.

It makes the Pod unready so that Services can stop routing normal traffic to it.

## Liveness

> Is this container unhealthy enough that kubelet should restart it?

A failed liveness probe can restart the container.

## Startup

> Has this slow-starting application successfully started yet?

A startup probe protects slow applications from liveness/readiness behaviour until startup succeeds.

Think:

```text
startup   -> have you started?
readiness -> should you receive traffic?
liveness  -> should the container be restarted?
```

## Add readiness and liveness to nginx

Patch the Deployment:

```bash
kubectl patch deployment api --type=strategic -p '
spec:
  template:
    spec:
      containers:
        - name: nginx
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 2
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 10
'
```

Wait:

```bash
kubectl rollout status deployment/api
```

Inspect:

```bash
kubectl get pods -l app=api
```

## Break readiness on purpose

Change readiness to a path that does not exist:

```bash
kubectl patch deployment api --type=strategic -p '
spec:
  template:
    spec:
      containers:
        - name: nginx
          readinessProbe:
            httpGet:
              path: /definitely-not-here
              port: 80
'
```

Watch:

```bash
kubectl get pods -l app=api -w
```

The Pods can be:

```text
STATUS: Running
```

while showing:

```text
READY: 0/1
```

That is an important distinction.

`Running` means the Pod's containers are running.

It does **not** mean Kubernetes considers the application ready for traffic.

## Follow the consequence into networking

Inspect EndpointSlice readiness:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api \
  -o yaml
```

Try the Service:

```bash
kubectl exec client -- \
  wget -T 2 -qO- http://api
```

The request should fail once all backends are unready.

This connects two ideas we learned separately:

```text
readiness probe fails
      |
      v
Pod Ready=False
      |
      v
endpoint not ready for normal Service traffic
      |
      v
client loses a usable backend
```

Now the purpose of readiness is concrete rather than definitional.

## Fix readiness

```bash
kubectl patch deployment api --type=strategic -p '
spec:
  template:
    spec:
      containers:
        - name: nginx
          readinessProbe:
            httpGet:
              path: /
              port: 80
'
```

Wait:

```bash
kubectl rollout status deployment/api
```

Verify:

```bash
kubectl exec client -- wget -qO- http://api
```

---

# Part V - Containers Working Together

# 17. Multi-Container Pods [CKAD]

A Pod can contain multiple containers.

That does **not** mean a Pod should become a miniature virtual machine full of unrelated services.

Containers belong in the same Pod when they need very tight lifecycle, networking or storage coupling.

Containers in one Pod share the same network namespace, so they can talk over `localhost`.

They can also mount the same volumes.

## Shared-volume experiment

Save as `multi.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: multi
spec:
  containers:
    - name: writer
      image: busybox:1.36
      command:
        - sh
        - -c
        - |
          while true; do
            date > /data/index.html
            sleep 2
          done
      volumeMounts:
        - name: shared
          mountPath: /data

    - name: web
      image: nginx:1.27-alpine
      volumeMounts:
        - name: shared
          mountPath: /usr/share/nginx/html

  volumes:
    - name: shared
      emptyDir: {}
```

Apply:

```bash
kubectl apply -f multi.yaml
```

Wait:

```bash
kubectl wait \
  --for=condition=Ready \
  pod/multi \
  --timeout=60s
```

Inspect the containers:

```bash
kubectl get pod multi \
  -o jsonpath='{.spec.containers[*].name}{"\n"}'
```

Read the shared file from nginx:

```bash
kubectl exec multi -c web -- \
  cat /usr/share/nginx/html/index.html
```

Wait a few seconds and repeat.

The writer updates the file.

The web container sees the same volume.

## Shared networking

From the writer container, call nginx over `localhost`:

```bash
kubectl exec multi -c writer -- \
  wget -qO- http://127.0.0.1
```

No Service is required between containers in the same Pod.

They already share a network namespace.

## Container-specific logs and exec

With multiple containers, specify the container when needed:

```bash
kubectl logs multi -c writer
kubectl logs multi -c web
kubectl exec multi -c writer -- date
```

Cleanup:

```bash
kubectl delete pod multi
rm -f multi.yaml
```

---

# 18. Init Containers and Native Sidecars [CKAD] [DEV]

Different supporting containers solve different lifecycle problems.

## Init container: do work before the application starts

Use an init container when setup must complete successfully before normal application containers begin.

Save as `init-demo.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: init-demo
spec:
  initContainers:
    - name: prepare
      image: busybox:1.36
      command:
        - sh
        - -c
        - echo "generated by init container" > /data/index.html
      volumeMounts:
        - name: data
          mountPath: /data

  containers:
    - name: web
      image: nginx:1.27-alpine
      volumeMounts:
        - name: data
          mountPath: /usr/share/nginx/html

  volumes:
    - name: data
      emptyDir: {}
```

Apply:

```bash
kubectl apply -f init-demo.yaml
```

Inspect:

```bash
kubectl describe pod init-demo
```

Read the generated content:

```bash
kubectl exec init-demo -- \
  cat /usr/share/nginx/html/index.html
```

The sequence was:

```text
init container starts
      |
      v
prepares shared data
      |
      v
init container completes
      |
      v
application container starts
```

Cleanup:

```bash
kubectl delete pod init-demo
rm -f init-demo.yaml
```

## Native sidecar: supporting process for the Pod lifetime

Modern Kubernetes implements native sidecars as restartable init containers using:

```yaml
restartPolicy: Always
```

Example fragment:

```yaml
spec:
  initContainers:
    - name: log-forwarder
      image: busybox:1.36
      restartPolicy: Always
      command:
        - sh
        - -c
        - tail -F /logs/app.log
```

The important lifecycle difference is:

```text
regular init container
    -> starts
    -> completes
    -> application can continue

native sidecar
    -> starts in init ordering
    -> remains running with the Pod
```

Good sidecar examples include:

- log forwarding
- local proxying
- configuration synchronisation
- security helpers

Use a sidecar when the supporting functionality genuinely belongs to the same Pod lifecycle.

Do not group unrelated services into one Pod merely because Kubernetes allows multiple containers.

---

# Part VI - Finite, Stateful and Node-Scoped Workloads

# 19. Jobs and CronJobs [CKAD]

A Deployment represents work that should keep running.

Some work should **finish**.

That is the problem a Job solves.

## Job: run finite work to completion

Create:

```bash
kubectl create job hello \
  --image=busybox:1.36 \
  -- echo hello-from-job
```

Inspect:

```bash
kubectl get jobs
kubectl get pods -l job-name=hello
```

Logs:

```bash
kubectl logs job/hello
```

Completion status:

```bash
kubectl get job hello \
  -o jsonpath='{.status.succeeded}{"\n"}'
```

Ownership:

```bash
kubectl get pods \
  -l job-name=hello \
  -o custom-columns='POD:.metadata.name,OWNER:.metadata.ownerReferences[0].name'
```

A Job controller is still reconciling desired state.

Its desired state is just different:

```text
Deployment -> keep N replicas running
Job        -> achieve N successful completions
```

Cleanup:

```bash
kubectl delete job hello
```

## CronJob: create Jobs on a schedule

Create:

```bash
kubectl create cronjob clock \
  --image=busybox:1.36 \
  --schedule='*/2 * * * *' \
  -- date
```

Inspect:

```bash
kubectl get cronjobs
```

Rather than waiting, manually create a Job from its template:

```bash
kubectl create job \
  --from=cronjob/clock \
  clock-now
```

Follow the ownership model:

```text
CronJob
   |
   v
Job
   |
   v
Pod
```

Logs:

```bash
kubectl logs job/clock-now
```

Useful CronJob controls include:

```text
schedule
suspend
concurrencyPolicy
startingDeadlineSeconds
successfulJobsHistoryLimit
failedJobsHistoryLimit
```

Discover them rather than guessing:

```bash
kubectl explain cronjob.spec
```

Cleanup:

```bash
kubectl delete cronjob clock
kubectl delete job clock-now
```

---

# 20. Storage: Pod Lifetime vs Data Lifetime [CKAD]

Containers and Pods are replaceable.

Data is often not.

Kubernetes therefore separates workload lifetime from storage lifetime.

## `emptyDir`: data that belongs to a Pod

We already used `emptyDir` in the multi-container example.

Its lifetime is tied to the Pod:

```text
container restart
      |
      v
emptyDir remains

Pod deletion
      |
      v
emptyDir disappears
```

This makes it useful for:

- scratch space
- caches
- sharing files between containers in one Pod

It is not durable application storage.

## PersistentVolumeClaim: ask the cluster for durable storage

A Pod should not usually care whether storage is backed by EBS, Ceph, local disks, NFS or another implementation.

It asks for storage through a PersistentVolumeClaim.

First inspect StorageClasses:

```bash
kubectl get storageclass
```

Save as `pvc.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

Apply:

```bash
kubectl apply -f pvc.yaml
```

Inspect:

```bash
kubectl get pvc data
```

If your cluster has a default dynamic provisioner, the claim should become `Bound`.

If it remains `Pending`, inspect:

```bash
kubectl describe pvc data
```

The cluster may not have a default StorageClass or suitable PersistentVolume.

That is a platform capability issue rather than a YAML syntax issue.

## Prove that data can outlive a Pod

Assuming the claim is `Bound`, create a writer Pod.

Save as `pvc-writer.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pvc-writer
spec:
  containers:
    - name: writer
      image: busybox:1.36
      command: ["sh", "-c", "echo persistent-data > /data/message; sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data
```

Apply:

```bash
kubectl apply -f pvc-writer.yaml
```

Wait:

```bash
kubectl wait \
  --for=condition=Ready \
  pod/pvc-writer \
  --timeout=60s
```

Check:

```bash
kubectl exec pvc-writer -- cat /data/message
```

Delete the Pod:

```bash
kubectl delete pod pvc-writer
```

Now create a different Pod using the same claim.

Save as `pvc-reader.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pvc-reader
spec:
  containers:
    - name: reader
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data
```

Apply:

```bash
kubectl apply -f pvc-reader.yaml
```

Read:

```bash
kubectl exec pvc-reader -- cat /data/message
```

Expected:

```text
persistent-data
```

The first Pod is gone.

The claim remained.

That is the useful boundary:

```text
Pod lifetime != persistent data lifetime
```

Cleanup:

```bash
kubectl delete pod pvc-reader --ignore-not-found
kubectl delete pvc data
rm -f pvc.yaml pvc-writer.yaml pvc-reader.yaml
```

---

# 21. StatefulSets: Stable Replica Identity [CKAD]

Deployments intentionally treat replicas as interchangeable.

Sometimes the application cares which replica is which.

Databases, clustered systems and ordered members may need stable identity.

That is the problem StatefulSets solve.

A StatefulSet can provide:

- stable Pod names
- ordered creation and termination
- stable network identity when paired with a headless Service
- per-replica persistent storage through volume claim templates

## Small identity experiment

Save as `stateful.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: stateful-web
spec:
  clusterIP: None
  selector:
    app: stateful-web
  ports:
    - port: 80
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: stateful-web
spec:
  serviceName: stateful-web
  replicas: 3
  selector:
    matchLabels:
      app: stateful-web
  template:
    metadata:
      labels:
        app: stateful-web
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
```

Apply:

```bash
kubectl apply -f stateful.yaml
```

Observe:

```bash
kubectl get statefulsets
kubectl get pods -l app=stateful-web
```

Pod names are predictable:

```text
stateful-web-0
stateful-web-1
stateful-web-2
```

Delete one:

```bash
kubectl delete pod stateful-web-1
```

Observe:

```bash
kubectl get pods -l app=stateful-web -w
```

The replacement is still:

```text
stateful-web-1
```

Compare with Deployment-generated Pod names.

The point is not that StatefulSet Pods are immortal.

They are still replaceable.

The point is that their **identity is stable across replacement**.

Cleanup:

```bash
kubectl delete -f stateful.yaml
rm -f stateful.yaml
```

---

# 22. DaemonSets: One Workload Per Matching Node [CKAD]

A Deployment asks for an arbitrary number of replicas.

Some software instead needs to run on every relevant node.

Examples include:

- CNI agents
- storage agents
- log collectors
- node monitoring

That is what a DaemonSet expresses.

Save as `daemonset.yaml`:

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-demo
spec:
  selector:
    matchLabels:
      app: node-demo
  template:
    metadata:
      labels:
        app: node-demo
    spec:
      containers:
        - name: sleeper
          image: busybox:1.36
          command: ["sh", "-c", "sleep 3600"]
```

Apply:

```bash
kubectl apply -f daemonset.yaml
```

Observe:

```bash
kubectl get daemonset node-demo
kubectl get pods -l app=node-demo -o wide
kubectl get nodes
```

On a simple untainted lab cluster you will often see roughly one Pod per eligible node.

The important distinction is:

```text
Deployment
    -> desired replica count

DaemonSet
    -> desired eligible-node coverage
```

Cleanup:

```bash
kubectl delete daemonset node-demo
rm -f daemonset.yaml
```

---

# Part VII - Identity, Authorization and Runtime Security

# 23. ServiceAccounts, RBAC and Admission [CKAD]

When a human or workload talks to the Kubernetes API, several separate questions are involved.

```text
Authentication
    -> who are you?

Authorization
    -> may you perform this action?

Admission
    -> even if authorized, is this object acceptable and should it be mutated?
```

Keeping these stages separate avoids a lot of confusion.

## ServiceAccount: workload identity

A ServiceAccount represents an identity for workloads inside Kubernetes.

Create one:

```bash
kubectl create serviceaccount api-sa
```

Inspect:

```bash
kubectl get serviceaccount api-sa -o yaml
```

Modern Kubernetes uses short-lived projected ServiceAccount credentials rather than relying on automatically created permanent token Secrets.

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

## RBAC: authorize actions

Create a Role that can read Pods.

Save as `rbac.yaml`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: api-sa-pod-reader
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
kubectl apply -f rbac.yaml
```

Ask Kubernetes whether that identity may list Pods:

```bash
kubectl auth can-i list pods \
  --as=system:serviceaccount:cookbook:api-sa
```

Expected on a lab where your current identity is allowed to impersonate:

```text
yes
```

Ask whether it may delete Pods:

```bash
kubectl auth can-i delete pods \
  --as=system:serviceaccount:cookbook:api-sa
```

Expected:

```text
no
```

RBAC objects connect like this:

```text
ServiceAccount
      |
      v
RoleBinding
      |
      v
Role
      |
      v
allowed API verbs/resources
```

## Role vs ClusterRole

A `Role` contains namespaced permissions.

A `ClusterRole` can contain cluster-wide permissions and can also be bound within a namespace.

Likewise:

```text
RoleBinding        -> binding scoped to a namespace
ClusterRoleBinding -> binding across the cluster
```

For CKAD, the key is being able to read and construct the relationship rather than memorising every possible API verb.

## Admission control

After authentication and authorization, admission controllers can validate or mutate an API request.

Examples of things that may be enforced through admission include:

- Pod security requirements
- quotas
- policy rules
- injected defaults or sidecars in some platforms

This explains a useful failure class:

```text
I am authenticated
      |
      v
I am authorized
      |
      v
API request still rejected
      |
      v
check admission or policy error
```

Cleanup only the RBAC lab objects, but keep the ServiceAccount because the Deployment currently uses it:

```bash
kubectl delete -f rbac.yaml
rm -f rbac.yaml
```

---

# 24. SecurityContext and Container Privilege [CKAD]

Container runtime security should be part of the workload definition rather than an undocumented node-side convention.

A `securityContext` can exist at Pod level and container level.

Save as `secure-demo.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-demo
spec:
  securityContext:
    runAsNonRoot: true

  containers:
    - name: shell
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      securityContext:
        runAsUser: 10001
        allowPrivilegeEscalation: false
        capabilities:
          drop:
            - ALL
```

Apply:

```bash
kubectl apply -f secure-demo.yaml
```

Inspect identity:

```bash
kubectl exec secure-demo -- id
```

Inspect the configured container security context:

```bash
kubectl get pod secure-demo \
  -o jsonpath='{.spec.containers[0].securityContext}{"\n"}'
```

Useful controls include:

```text
runAsNonRoot
runAsUser
runAsGroup
fsGroup
allowPrivilegeEscalation
readOnlyRootFilesystem
capabilities
seccompProfile
```

Do not treat these as synonyms.

For example:

```text
runAsNonRoot
    -> refuse a root runtime identity

allowPrivilegeEscalation: false
    -> process cannot gain more privileges than its parent

capabilities.drop
    -> remove specific Linux capabilities

readOnlyRootFilesystem
    -> make the container root filesystem read-only
```

Cleanup:

```bash
kubectl delete pod secure-demo
rm -f secure-demo.yaml
```

---

# Part VIII - Network Policy and External HTTP Routing

# 25. NetworkPolicy: Which Pods May Talk? [CKAD]

A Service answers:

> Where should traffic go?

A NetworkPolicy answers a different question:

> Which network flows should be allowed?

NetworkPolicy enforcement depends on the cluster's CNI plugin.

If your CNI does not enforce NetworkPolicy, the objects can exist without changing packet flow.

## Confirm current connectivity

```bash
kubectl exec client -- wget -qO- http://api
```

## Deny ingress to the API Pods

Save as `deny-api.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-api
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
```

Apply:

```bash
kubectl apply -f deny-api.yaml
```

If your CNI enforces policy, this should eventually fail:

```bash
kubectl exec client -- \
  wget -T 2 -qO- http://api
```

Why?

The selected API Pods now have ingress isolation, but no ingress rule permits the client.

## Allow only labelled clients

Label the client:

```bash
kubectl label pod client access=api
```

Replace the policy with `allow-api.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              access: api
      ports:
        - protocol: TCP
          port: 80
```

Apply:

```bash
kubectl delete networkpolicy deny-api
kubectl apply -f allow-api.yaml
```

Retry:

```bash
kubectl exec client -- wget -qO- http://api
```

This is a selector story again:

```text
NetworkPolicy podSelector
    -> which destination Pods are governed?

from.podSelector
    -> which source Pods are allowed?
```

Cleanup:

```bash
kubectl delete networkpolicy allow-api --ignore-not-found
kubectl label pod client access-
rm -f deny-api.yaml allow-api.yaml
```

---

# 26. Ingress: HTTP Routing Into the Cluster [CKAD]

A ClusterIP Service gives an application a stable endpoint inside the cluster.

Users outside the cluster often need HTTP routing to that Service.

Ingress describes HTTP and HTTPS routing rules.

An important distinction:

> An Ingress object is configuration. An Ingress controller is the software that implements it.

## Check whether the cluster has an IngressClass

```bash
kubectl get ingressclass
```

If there is no Ingress controller, you can still study and create the API object, but traffic will not be routed.

## Create an Ingress rule

Save as `ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
spec:
  rules:
    - host: api.cookbook.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
```

If your cluster requires a particular class, add:

```yaml
spec:
  ingressClassName: <class-name>
```

Apply:

```bash
kubectl apply -f ingress.yaml
```

Inspect:

```bash
kubectl get ingress api
kubectl describe ingress api
```

The routing model is:

```text
HTTP request
   |
   v
Ingress controller
   |
   | host/path rule
   v
Service
   |
   v
ready backend Pods
```

Notice how Ingress does not replace a Service.

It usually routes **to** one.

Cleanup:

```bash
kubectl delete ingress api
rm -f ingress.yaml
```

---

# Part IX - Deployment Strategies and Packaging

# 27. Blue-Green and Canary Deployments [CKAD]

A Deployment's rolling update strategy is not the only way to release software.

Two common patterns are blue-green and canary.

The interesting Kubernetes lesson is that both can be built from primitives we already understand: Deployments, labels and Services.

## Blue-green: switch the Service selector

Create two versions with explicit Pod labels.

Save as `blue-green.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop-blue
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shop
      release: blue
  template:
    metadata:
      labels:
        app: shop
        release: blue
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop-green
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shop
      release: green
  template:
    metadata:
      labels:
        app: shop
        release: green
    spec:
      containers:
        - name: nginx
          image: nginx:1.28-alpine
---
apiVersion: v1
kind: Service
metadata:
  name: shop
spec:
  selector:
    app: shop
    release: blue
  ports:
    - port: 80
      targetPort: 80
```

Apply:

```bash
kubectl apply -f blue-green.yaml
```

See which Pods are selected:

```bash
kubectl get pods -l app=shop --show-labels
kubectl get endpointslices \
  -l kubernetes.io/service-name=shop
```

Initially the Service selects blue.

Switch to green:

```bash
kubectl patch service shop \
  --type=merge \
  -p '{"spec":{"selector":{"app":"shop","release":"green"}}}'
```

Inspect endpoints again:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=shop
```

The release switch was a selector change.

That is blue-green in its simplest Kubernetes form.

Cleanup:

```bash
kubectl delete -f blue-green.yaml
rm -f blue-green.yaml
```

## Canary: two versions behind one Service

A crude Kubernetes-only canary can run two Deployments with the same Service selector.

Conceptually:

```text
stable Deployment: 9 replicas
canary Deployment: 1 replica

both Pods:
  app=shop

Service selector:
  app=shop
```

Roughly one tenth of the available backend Pods would be canary Pods.

This is **not precise request weighting**.

A plain Service does not promise exact percentages, user affinity, header matching or request-level policy.

Those features generally require an ingress controller, gateway, service mesh or another higher-level traffic-routing system.

The lesson is to understand what the primitive actually guarantees rather than reading more into it.

---

# 28. Helm: Package Kubernetes Resources [CKAD]

Raw YAML is useful, but real applications often contain many related resources and environment-specific values.

Helm packages Kubernetes resources into a **Chart**.

Think:

```text
Chart templates + values
          |
          v
rendered Kubernetes manifests
          |
          v
Kubernetes API
```

Helm is not a replacement for Kubernetes objects.

It generates and manages them.

## Create a local chart

Assuming the `helm` CLI is installed:

```bash
helm create cookbook-api
```

Inspect:

```bash
find cookbook-api -maxdepth 2 -type f
```

## Render before installing

```bash
helm template test cookbook-api
```

Override a value:

```bash
helm template test cookbook-api \
  --set replicaCount=2
```

Rendering is a powerful debugging technique because it lets you inspect the actual Kubernetes manifests before they reach the API server.

## Install

```bash
helm install cookbook-example cookbook-api
```

Inspect:

```bash
helm list
kubectl get all -l app.kubernetes.io/instance=cookbook-example
```

Change a value through an upgrade:

```bash
helm upgrade cookbook-example cookbook-api \
  --set replicaCount=2
```

History:

```bash
helm history cookbook-example
```

Uninstall:

```bash
helm uninstall cookbook-example
rm -rf cookbook-api
```

A useful failure workflow is:

```text
values
  |
  v
helm template
  |
  v
inspect rendered YAML
  |
  v
kubectl explain / server validation
```

---

# 29. Kustomize: Modify YAML Without a Template Language [CKAD]

Kustomize solves a different packaging problem.

Instead of templating YAML, it starts with ordinary Kubernetes manifests and layers transformations over them.

Think:

```text
base resources
      +
overlay changes
      |
      v
rendered Kubernetes manifests
```

`kubectl` has built-in Kustomize support.

## Create a base

```bash
mkdir -p kustomize/base
mkdir -p kustomize/overlays/dev
```

Generate a Deployment:

```bash
kubectl create deployment k-api \
  --image=nginx:1.27-alpine \
  --dry-run=client \
  -o yaml > kustomize/base/deployment.yaml
```

Create `kustomize/base/kustomization.yaml`:

```yaml
resources:
  - deployment.yaml
```

## Create an overlay

Create `kustomize/overlays/dev/kustomization.yaml`:

```yaml
resources:
  - ../../base

namePrefix: dev-

replicas:
  - name: k-api
    count: 2
```

Render:

```bash
kubectl kustomize kustomize/overlays/dev
```

Apply:

```bash
kubectl apply -k kustomize/overlays/dev
```

Inspect:

```bash
kubectl get deployment dev-k-api
```

Cleanup:

```bash
kubectl delete -k kustomize/overlays/dev
rm -rf kustomize
```

A useful distinction:

```text
Helm
    -> package + template/value system + release management

Kustomize
    -> transform/compose ordinary Kubernetes YAML
```

They can coexist in real systems.

---

# Part X - Observability and Debugging

# 30. API Versions and Deprecation [CKAD]

Kubernetes evolves.

Old manifests found in blogs and repositories can reference API versions the current cluster no longer serves.

Do not blindly reuse them.

Ask the cluster.

Supported resources:

```bash
kubectl api-resources
```

Supported API versions:

```bash
kubectl api-versions
```

Deployment schema:

```bash
kubectl explain deployment
```

Deployment strategy:

```bash
kubectl explain deployment.spec.strategy
```

Ingress paths:

```bash
kubectl explain ingress.spec.rules.http.paths
```

## Validate before changing the cluster

Client-side dry run checks local construction:

```bash
kubectl apply \
  --dry-run=client \
  -f manifest.yaml
```

Server-side dry run asks the API server to process the request without persisting it:

```bash
kubectl apply \
  --dry-run=server \
  -f manifest.yaml
```

Server-side validation is especially useful when you want current cluster schema and admission behaviour to participate.

A reliable workflow is:

```text
old example found online
      |
      v
kubectl api-resources / api-versions
      |
      v
kubectl explain
      |
      v
server-side dry run
      |
      v
apply
```

---

# 31. A Systematic Debugging Workflow [CKAD] [DEV]

Random commands make Kubernetes feel mysterious.

Most failures become easier when you follow the relationship between objects.

## Workload failure

Follow ownership downward:

```text
Deployment
    |
    v
ReplicaSet
    |
    v
Pod
    |
    v
Container
    |
    v
Process
```

Commands:

```bash
kubectl get deployment api
kubectl get rs -l app=api
kubectl get pods -l app=api
kubectl describe pod <pod>
kubectl logs <pod>
```

Previous crashed container instance:

```bash
kubectl logs <pod> --previous
```

Events:

```bash
kubectl get events \
  --sort-by=.metadata.creationTimestamp
```

Questions to ask in order:

```text
Did the controller create the expected child resource?
Did the Pod schedule?
Did the image pull?
Did the container start?
Did the process stay alive?
Did readiness succeed?
```

## Networking failure

Follow the request path:

```text
DNS
 |
 v
Service
 |
 v
selector
 |
 v
EndpointSlice
 |
 v
ready Pod
 |
 v
container port
 |
 v
process
```

Useful commands:

```bash
kubectl exec client -- nslookup api
kubectl get service api -o yaml
kubectl get pods -l app=api --show-labels
kubectl get endpointslices \
  -l kubernetes.io/service-name=api
kubectl describe pod <pod>
```

Then test the application directly from inside the cluster when possible.

## Configuration failure

Follow references:

```text
Pod spec
  |
  +-- ConfigMap name/key
  |
  +-- Secret name/key
  |
  +-- volume name
  |
  +-- mount path
```

Useful commands:

```bash
kubectl describe pod <pod>
kubectl get configmap <name> -o yaml
kubectl get secret <name> -o yaml
```

A misspelled Secret key can prevent a container from starting even though the Secret object itself exists.

## Authorization failure

Ask Kubernetes instead of guessing:

```bash
kubectl auth can-i get pods
kubectl auth can-i create deployments
```

For another identity, when impersonation is permitted:

```bash
kubectl auth can-i list pods \
  --as=system:serviceaccount:cookbook:api-sa
```

The general debugging habit is:

> Follow the API relationships until you find the first place where observed state stops matching your expectation.

---

# 32. Debugging Minimal Containers with Ephemeral Containers [DEV]

Production images may intentionally not contain:

```text
bash
curl
dig
tcpdump
ps
```

That is often desirable.

A production image does not need a complete incident-response toolbox merely to make debugging convenient.

When `kubectl exec` is insufficient, Kubernetes can add an ephemeral debugging container to an existing Pod.

Pick one API Pod:

```bash
POD=$(kubectl get pod -l app=api \
  -o jsonpath='{.items[0].metadata.name}')
```

Start a debug container:

```bash
kubectl debug -it "$POD" \
  --image=busybox:1.36 \
  --target=nginx
```

This gives you debugging utilities without permanently changing the production application image.

Depending on runtime and security configuration, process visibility and debugging capabilities can differ.

The conceptual point is:

```text
production container stays minimal
        +
temporary debug tooling when needed
```

rather than:

```text
ship every debugging utility in every production image forever
```

---

# Part XI - Extending Kubernetes

# 33. CRDs and Custom Resources [CKAD] [DEV]

Kubernetes' built-in API contains types such as:

```text
Pod
Deployment
Service
Secret
Job
```

But platform teams often want domain-specific APIs.

For example:

```yaml
kind: PreviewEnvironment
spec:
  image: shop:pr-482
  replicas: 2
```

A **CustomResourceDefinition (CRD)** teaches the Kubernetes API server about a new resource type.

This exercise requires permission to create cluster-scoped CRDs.

## Create a CRD

Save as `preview-crd.yaml`:

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: previewenvironments.platform.example.com
spec:
  group: platform.example.com
  scope: Namespaced

  names:
    plural: previewenvironments
    singular: previewenvironment
    kind: PreviewEnvironment
    shortNames:
      - preview

  versions:
    - name: v1alpha1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                image:
                  type: string
                replicas:
                  type: integer
                  minimum: 1
              required:
                - image
                - replicas
```

Apply:

```bash
kubectl apply -f preview-crd.yaml
```

Discover it:

```bash
kubectl api-resources | grep -i preview
```

Ask for its schema:

```bash
kubectl explain previewenvironments
kubectl explain previewenvironments.spec
```

The CRD extended API discovery just like a built-in type.

## Create a Custom Resource

Save as `preview.yaml`:

```yaml
apiVersion: platform.example.com/v1alpha1
kind: PreviewEnvironment
metadata:
  name: pr-482
spec:
  image: ghcr.io/example/shop:pr-482
  replicas: 2
```

Apply:

```bash
kubectl apply -f preview.yaml
```

Query:

```bash
kubectl get previewenvironments
```

Or use the short name:

```bash
kubectl get preview
```

Inspect:

```bash
kubectl get preview pr-482 -o yaml
```

Now notice what did **not** happen.

There are no application Pods for `pr-482`.

Why?

```text
CRD
 |
 v
Kubernetes understands the data type

but

No controller
 |
 v
Nothing implements its behaviour
```

This distinction is fundamental:

> A CRD extends the API. It does not, by itself, implement a control loop.

---

# 34. Custom Controllers: Turn an API Into Behaviour [DEV] [DEEP DIVE]

Suppose we want this:

```yaml
kind: PreviewEnvironment
spec:
  image: shop:pr-482
  replicas: 2
```

to result in:

```text
Deployment
Service
```

We need a controller.

Conceptually:

```text
Developer
   |
   | kubectl apply
   v
Kubernetes API
   |
   | PreviewEnvironment/pr-482
   v
Preview controller
   |
   +-- Deployment
   |
   +-- Service
```

The controller repeatedly reconciles desired state.

Pseudo-code:

```go
func Reconcile(name string) {
    desired := readPreviewEnvironment(name)
    actual := inspectCurrentResources(name)

    reconcileDeployment(desired, actual)
    reconcileService(desired, actual)

    updateStatus()
}
```

The important property is **idempotency**.

Good reconciliation logic says:

```text
Ensure a Deployment exists with image X and replicas N.
```

Bad reconciliation logic says:

```text
Create another Deployment every time reconcile runs.
```

A reconcile can happen repeatedly and for reasons your controller did not initiate.

The result should converge.

This is the same mental model from Chapter 1, now implemented by application-specific code.

---

# 35. Ownership, Finalizers, Status and Operators [DEV] [DEEP DIVE]

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

---

# 36. Clean Up the Custom API [DEV]

Delete the Custom Resource first:

```bash
kubectl delete preview pr-482
```

Delete the CRD:

```bash
kubectl delete crd \
  previewenvironments.platform.example.com
```

Deleting a CRD deletes the custom resources stored through that API.

Only do this casually in a disposable lab environment.

Remove local files:

```bash
rm -f preview.yaml preview-crd.yaml
```

---

# Part XII - CKAD Speed Layer

# 37. CKAD Command Patterns [CKAD]

Understanding matters first.

Once the mental model is solid, speed comes from having a small number of productive command patterns in muscle memory.

## Context and namespace

```bash
kubectl config get-contexts
kubectl config current-context
kubectl config set-context --current --namespace=cookbook
```

## Discovery

```bash
kubectl api-resources
kubectl api-versions
kubectl explain pod
kubectl explain deployment.spec.template.spec.containers
```

## Pods

Create:

```bash
kubectl run test \
  --image=busybox:1.36 \
  --restart=Never \
  --command -- sleep 3600
```

Generate YAML:

```bash
kubectl run test \
  --image=busybox:1.36 \
  --restart=Never \
  --dry-run=client \
  -o yaml
```

Logs and exec:

```bash
kubectl logs test
kubectl logs test --previous
kubectl exec -it test -- sh
```

## Deployments

Create:

```bash
kubectl create deployment api \
  --image=nginx:1.27-alpine \
  --replicas=3
```

Generate YAML:

```bash
kubectl create deployment api \
  --image=nginx:1.27-alpine \
  --replicas=3 \
  --dry-run=client \
  -o yaml
```

Scale:

```bash
kubectl scale deployment api --replicas=5
```

Image:

```bash
kubectl set image deployment/api \
  nginx=nginx:1.28-alpine
```

Rollouts:

```bash
kubectl rollout status deployment/api
kubectl rollout history deployment/api
kubectl rollout undo deployment/api
```

## Services

Expose a Deployment:

```bash
kubectl expose deployment api \
  --port=80 \
  --target-port=80
```

Generate Service YAML without creating:

```bash
kubectl expose deployment api \
  --port=80 \
  --target-port=80 \
  --dry-run=client \
  -o yaml
```

Endpoints:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api
```

## ConfigMaps and Secrets

```bash
kubectl create configmap app-config \
  --from-literal=MODE=dev

kubectl create secret generic app-secret \
  --from-literal=password=example
```

Generate instead of create:

```bash
kubectl create configmap app-config \
  --from-literal=MODE=dev \
  --dry-run=client \
  -o yaml

kubectl create secret generic app-secret \
  --from-literal=password=example \
  --dry-run=client \
  -o yaml
```

## Jobs and CronJobs

```bash
kubectl create job hello \
  --image=busybox:1.36 \
  -- echo hello

kubectl create cronjob clock \
  --image=busybox:1.36 \
  --schedule='*/5 * * * *' \
  -- date
```

Generate YAML by adding:

```text
--dry-run=client -o yaml
```

## Editing and patching

```bash
kubectl edit deployment api
```

Merge patch:

```bash
kubectl patch deployment api \
  --type=merge \
  -p '{"spec":{"replicas":2}}'
```

Strategic merge is useful for Kubernetes built-in list structures such as named containers:

```bash
kubectl patch deployment api \
  --type=strategic \
  -p 'spec:
        template:
          spec:
            containers:
              - name: nginx
                image: nginx:1.28-alpine'
```

## Output

YAML:

```bash
kubectl get pod test -o yaml
```

JSONPath:

```bash
kubectl get pod test \
  -o jsonpath='{.status.podIP}{"\n"}'
```

Custom columns:

```bash
kubectl get pods \
  -o custom-columns='NAME:.metadata.name,NODE:.spec.nodeName,IP:.status.podIP'
```

Sort:

```bash
kubectl get pods \
  --sort-by=.metadata.creationTimestamp
```

Labels:

```bash
kubectl get pods --show-labels
kubectl get pods -l app=api
```

## Waiting

```bash
kubectl wait \
  --for=condition=Ready \
  pod/test \
  --timeout=60s
```

Deployment rollout:

```bash
kubectl rollout status deployment/api --timeout=60s
```

## Debugging

```bash
kubectl get pods
kubectl describe pod <pod>
kubectl logs <pod>
kubectl logs <pod> --previous
kubectl get events --sort-by=.metadata.creationTimestamp
```

Network path:

```bash
kubectl get svc
kubectl get pods --show-labels
kubectl get endpointslices
kubectl exec <client> -- nslookup <service>
```

Authorization:

```bash
kubectl auth can-i get pods
```

## Temporary testing Pods

DNS/network shell:

```bash
kubectl run tmp \
  --image=busybox:1.36 \
  --restart=Never \
  -it --rm -- sh
```

If the exam environment has a different preferred utility image, use whatever image is already available and appropriate to the task.

## Useful shell habit

For commands you will repeat, capture names rather than retyping hashes:

```bash
POD=$(kubectl get pod -l app=api \
  -o jsonpath='{.items[0].metadata.name}')

echo "$POD"
```

The goal is not command golf.

The goal is to spend exam time solving the Kubernetes problem rather than manually reconstructing YAML you could have generated.

---

# 38. Final Lab Cleanup

The easiest cleanup is deleting the namespace because nearly everything in this cookbook is namespaced:

```bash
kubectl delete namespace cookbook
```

If you changed your current context to default to `cookbook`, clear or change that namespace afterwards.

For example:

```bash
kubectl config set-context \
  --current \
  --namespace=default
```

Check:

```bash
kubectl config view --minify \
  -o jsonpath='{..namespace}{"\n"}'
```

---

# Appendix A - The Mental Models Worth Remembering

If you remember nothing else, remember these.

## Kubernetes is a control loop

```text
spec
 |
 v
controller
 |
 v
actual state
 |
 v
status
 |
 +---- observe and reconcile ----+
```

## Controller-managed Pods are replaceable

```text
Deployment
    |
    v
ReplicaSet
    |
    v
Pods
```

Delete a Pod and desired state remains.

The controller creates another.

## A Service is stable because Pods are not

```text
DNS name
  |
  v
Service
  |
  v
EndpointSlices
  |
  v
ready Pods
```

## Labels are relationships, not decoration

```text
selector
  |
  v
matching labels
```

Services, controllers and policies all build behaviour on this idea.

## Readiness and liveness answer different questions

```text
readiness -> should traffic reach me?
liveness  -> should kubelet restart me?
startup   -> have I successfully started yet?
```

## Configuration should not require rebuilding the image

```text
ConfigMap -> non-secret configuration
Secret    -> sensitive configuration API
Downward API -> runtime Kubernetes metadata
```

## Data lifetime is a separate decision from Pod lifetime

```text
emptyDir -> Pod-scoped
PVC      -> persistent storage claim
```

## Debug relationships rather than symptoms

Workload:

```text
Deployment -> ReplicaSet -> Pod -> Container -> Process
```

Network:

```text
DNS -> Service -> selector -> EndpointSlice -> ready Pod -> port -> process
```

Configuration:

```text
Pod spec -> referenced object -> key -> mount/env -> application
```

## Kubernetes extension uses the same model

```text
CRD
  -> teach the API a type

Custom Resource
  -> declare desired state for that type

Controller
  -> reconcile it

Operator
  -> controller + domain-specific operational knowledge
```

---

# Appendix B - Current CKAD Domain Map

This cookbook is intentionally organised for understanding rather than mirroring the exam outline chapter-for-chapter.

The current CKAD domains map roughly as follows:

## Application Design and Build - 20%

Covered by:

- container image definitions and builds
- Pods and container command/args
- workload selection
- multi-container Pods
- init containers and sidecars
- Jobs and CronJobs
- ephemeral and persistent volumes
- StatefulSets and DaemonSets

## Application Deployment - 20%

Covered by:

- Deployments and ReplicaSets
- scaling
- rolling updates and rollback
- blue-green and canary strategies
- Helm
- Kustomize

## Application Observability and Maintenance - 15%

Covered by:

- `get`, `describe`, logs and events
- readiness, liveness and startup probes
- rollout state
- API deprecation and discovery
- systematic debugging
- ephemeral debug containers

## Application Environment, Configuration and Security - 25%

Covered by:

- requests and limits
- quotas and limits policy concepts
- ConfigMaps and Secrets
- Downward API
- ServiceAccounts
- RBAC and authorization
- admission concepts
- SecurityContext and capabilities
- CRDs and Operators

## Services and Networking - 20%

Covered by:

- Services
- labels and selectors
- EndpointSlices
- DNS
- network troubleshooting
- NetworkPolicy
- Ingress

---

# Appendix C - Official References

Prefer current official documentation when a field, API version or exam detail is uncertain.

- Kubernetes documentation: https://kubernetes.io/docs/
- Kubernetes API reference: https://kubernetes.io/docs/reference/kubernetes-api/
- kubectl reference: https://kubernetes.io/docs/reference/kubectl/
- CKAD certification: https://www.cncf.io/training/certification/ckad/
- Linux Foundation CKAD page: https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/

The habit this cookbook is trying to teach is simple:

> Do not memorise Kubernetes as a pile of resource definitions. Learn the control loops and relationships, then let the API tell you the exact syntax.
