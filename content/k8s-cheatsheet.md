# Kubernetes for Application Developers

A runnable Kubernetes cookbook for application developers and CKAD candidates.

The goal is not to memorise YAML.

The goal is to build a mental model of Kubernetes, use the API deliberately, observe what the control plane did, break things on purpose, and work out why they broke.

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

## Scheduling controls placement, not API permission

Later we will meet node selectors, affinity, taints and tolerations in broader platform contexts.

Keep one distinction in mind now:

```text
scheduler controls
    -> where a Pod is eligible to run

RBAC
    -> what API operations an identity may perform
```

A `NoSchedule` taint on a control-plane node can keep ordinary workloads away from that node. It does **not** decide who may edit Node objects through the API, and it does not control who may SSH into the machine.

We will bring those boundaries together in Chapter 23.

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

# 9. Failed Rollouts: Debugging and Local Images [CKAD] [DEV]

A failed rollout is more educational than a successful one.

We will fail one in two different ways.

The first failure is obvious: we ask for an image that does not exist. That gives us a controlled way to learn the debugging path and rollback.

The second failure is more interesting: we build an image ourselves, prove that it exists, and Kubernetes still cannot run it.

Those two failures can produce the same Pod status for very different reasons.

That is exactly why good debugging starts with evidence rather than memorising status names.

## Experiment 1 - deploy an image that does not exist

Change the Deployment to an image tag that is deliberately invalid:

```bash
kubectl set image deployment/api \
  nginx=nginx:this-tag-does-not-exist
```

Watch Pods:

```bash
kubectl get pods -l app=api -w
```

You should eventually see a new Pod move through states such as:

```text
ErrImagePull
ImagePullBackOff
```

Press `Ctrl-C` once you have seen the failure.

Do not just memorise what `ImagePullBackOff` means.

Follow the object chain.

### Is the Deployment healthy?

```bash
kubectl get deployment api
```

Try waiting for the rollout, but use a short timeout so the lab does not wait for the Deployment's full progress deadline:

```bash
kubectl rollout status deployment/api --timeout=30s
```

### Which ReplicaSet is new?

```bash
kubectl get rs -l app=api
```

### Which Pod is failing?

```bash
kubectl get pods -l app=api
```

Describe the failing Pod:

```bash
kubectl describe pod <failing-pod>
```

The **Events** section should explain the image pull failure.

Cluster events can also help:

```bash
kubectl get events \
  --sort-by=.metadata.creationTimestamp
```

The debugging path was:

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

The high-level status told us **where reconciliation was stuck**.

Events told us **why**.

## Why are the old Pods still running?

This is a useful consequence of the rolling update strategy from the previous chapter.

Inspect the Deployment and ReplicaSets together:

```bash
kubectl get deployment,rs,pods -l app=api
```

You may see three healthy old Pods plus one broken new Pod.

Conceptually:

```text
Deployment api
    |
    +-- old ReplicaSet
    |      +-- Running Pod
    |      +-- Running Pod
    |      +-- Running Pod
    |
    +-- new ReplicaSet
           +-- ImagePullBackOff
```

Kubernetes has not forgotten that you asked for three replicas.

But the desired state now means more than just a number:

```text
replicas = 3
AND
image = nginx:this-tag-does-not-exist
```

Reality currently satisfies the replica availability requirement using the old version, but it cannot satisfy the new Pod template.

A rolling update therefore stalls instead of immediately throwing away every healthy old Pod.

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

---

## Sidequest - the image exists, so why can't Kubernetes run it?

The previous failure was unsurprising.

The image did not exist.

Now let's create an image that definitely **does** exist and see why Kubernetes may still report the same failure.

This is a useful developer workflow as well as a debugging exercise.

### Build a tiny application image

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

Confirm that Docker can see it:

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

So the image exists.

The next question is **where** it exists.

### Before changing the Deployment, inspect the container name

Run:

```bash
kubectl get deployment api \
  -o jsonpath='{range .spec.template.spec.containers[*]}{.name}{" -> "}{.image}{"\n"}{end}'
```

You should see something similar to:

```text
nginx -> nginx:1.27-alpine
```

There are three separate identities here:

```text
Deployment name: api
container name:  nginx
image name:      nginx:1.27-alpine
```

They are not interchangeable.

`kubectl set image` uses:

```text
kubectl set image <resource> <container-name>=<new-image>
```

So this is correct:

```bash
kubectl set image deployment/api \
  nginx=example/web:v1
```

This would not be correct if the container were not named `web`:

```text
kubectl set image deployment/api web=example/web:v1
                                 ^^^
                                 container name
```

Kubernetes is not identifying the container from the image name.

### Watch the rollout

```bash
kubectl get pods -l app=api -w
```

On the `kind` lab cluster, you will probably see something like:

```text
NAME                  READY   STATUS             RESTARTS
api-6645d7d87-24nw7   1/1     Running            0
api-6645d7d87-6wbjr   1/1     Running            0
api-6645d7d87-wcwpx   1/1     Running            0
api-8fc59985f-4nhhm   0/1     ErrImagePull       0
api-8fc59985f-4nhhm   0/1     ImagePullBackOff   0
```

Press `Ctrl-C` once the failure appears.

This looks very similar to our deliberately broken rollout.

But this time we know:

```text
example/web:v1 exists
```

So "image does not exist" cannot be the whole explanation.

### Use the debugging path again

Check the rollout:

```bash
kubectl rollout status deployment/api --timeout=30s
```

Inspect the ReplicaSets and Pods:

```bash
kubectl get deployment,rs,pods -l app=api
```

Describe the failing Pod:

```bash
kubectl describe pod <failing-pod>
```

Read the Events at the bottom.

The node is trying to obtain:

```text
example/web:v1
```

and cannot.

The same symptom now has a different root cause.

## Docker's image store is not the kind node's image store

Check the current Kubernetes context:

```bash
kubectl config current-context
```

For the lab used in this cookbook you may see:

```text
kind-ckad
```

`kind` means **Kubernetes IN Docker**.

The Kubernetes node itself runs as a container and has its own container runtime.

Our image currently exists in the image store used by Docker on the host:

```text
host
 |
 +-- Docker image store
 |      |
 |      +-- example/web:v1
 |
 +-- kind node container
        |
        +-- containerd image store
               |
               +-- example/web:v1 is missing
```

These are different image stores.

When the kubelet asks the node's container runtime to start:

```text
example/web:v1
```

and the image is not present locally, the runtime attempts to obtain it from a registry according to the Pod's image pull policy.

We built the image locally, but we never pushed it to a registry.

So the pull fails.

This is the boundary that a happy-path public image hides:

> `docker build` succeeding on your workstation does not mean every Kubernetes node can access that image.

In a normal remote or production workflow the path is usually:

```text
developer / CI
      |
      v
build image
      |
      v
push to registry
      |
      v
Kubernetes node pulls image
      |
      v
container starts
```

For our disposable local kind cluster, there is a shortcut.

## Load the image into kind

The context name is normally:

```text
kind-<cluster-name>
```

So for:

```text
kind-ckad
```

the kind cluster name is:

```text
ckad
```

Load the image into its node:

```bash
kind load docker-image example/web:v1 \
  --name ckad
```

Now the path is:

```text
host Docker image store
        |
        | kind load docker-image
        v
kind node image store
        |
        v
kubelet can start example/web:v1
```

Kubernetes may recover on its next image-pull retry.

If the existing Pod is already backing off and you want to make the next observation immediate, delete only the failing Pod:

```bash
kubectl delete pod <failing-pod>
```

Do **not** modify the Deployment.

The new ReplicaSet still wants a Pod matching the current template, so deleting the failed Pod causes another one to appear.

Watch:

```bash
kubectl get pods -l app=api -w
```

This time the replacement should be able to start from the image now present on the node.

## Watch reconciliation continue

```bash
kubectl rollout status deployment/api
```

Then inspect the whole ownership chain:

```bash
kubectl get deployment,rs,pods -l app=api
```

Eventually the old ReplicaSet should be scaled to zero and the new ReplicaSet should own all three running Pods.

Notice what we did **not** do:

```text
restart Kubernetes
recreate the Deployment
manually create three Pods
```

The desired state was already correct.

We fixed the external condition preventing the node from satisfying it.

The existing control loops carried on from there.

## Prove that our application is running

Port-forward the Deployment:

```bash
kubectl port-forward deployment/api 8080:80
```

From another terminal:

```bash
curl http://127.0.0.1:8080
```

You should see HTML containing:

```text
Hello from our own image
version: v1
```

Press `Ctrl-C` in the port-forward terminal when finished.

## Do the workflow correctly with v2

Now repeat the process with the order understood.

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

Build a new image tag:

```bash
docker build -t example/web:v2 .
```

Make the image available to the kind node **before** requesting it:

```bash
kind load docker-image example/web:v2 \
  --name ckad
```

Then change desired state:

```bash
kubectl set image deployment/api \
  nginx=example/web:v2
```

Watch the rollout:

```bash
kubectl rollout status deployment/api
```

The local development loop is now explicit:

```text
edit source
    |
    v
build image
    |
    v
make image available to nodes
    |
    v
change Deployment spec
    |
    v
controllers reconcile
    |
    v
new Pods become ready
```

For kind:

```bash
docker build -t example/web:v2 .
kind load docker-image example/web:v2 --name ckad
kubectl set image deployment/api nginx=example/web:v2
kubectl rollout status deployment/api
```

On a real multi-node or remote cluster, the middle step is normally a registry rather than `kind load`.

## Why use a new image tag?

During local development it is tempting to rebuild the same tag repeatedly:

```text
example/web:v1
```

with different contents.

Prefer immutable or at least unique version tags while learning this workflow:

```text
example/web:v1
example/web:v2
example/web:v3
```

Then the desired image reference tells you which build Kubernetes was asked to run.

Production systems often go further and deploy immutable image digests.

The important principle is the same:

```text
know exactly which image desired state refers to
```

## What the two failures taught us

Both experiments produced an image pull failure.

But the causes were different.

### Failure 1

```text
requested image
      |
      v
image does not exist
      |
      v
pull fails
```

The fix was to correct desired state:

```text
kubectl rollout undo
```

### Failure 2

```text
requested image
      |
      v
image exists on developer machine
      |
      v
image absent from Kubernetes node
      |
      v
registry cannot provide it
      |
      v
pull fails
```

The desired state was valid.

The fix was to make the requested artifact available to the node:

```text
kind load docker-image
```

That distinction is much more useful than memorising:

```text
ImagePullBackOff = image problem
```

A better mental model is:

```text
status tells you where the system is stuck
        |
        v
Events and object relationships tell you why
```

And underneath both examples is still the same Kubernetes control loop:

```text
desired Pod template
        |
        v
controller creates replacement workload
        |
        v
node attempts to realise it
        |
        +---- cannot obtain image ----> status + Events expose failure
        |
        v
condition fixed
        |
        v
reconciliation continues
```

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

Our current nginx-based image has application content baked into it.

Suppose that content or configuration needs to vary between environments.

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

The useful question is not:

> How many containers can a Pod contain?

It is:

> What lifecycle relationship does this supporting process have with the application?

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

Inspect the separate status lists:

```bash
kubectl get pod init-demo \
  -o jsonpath='{range .status.initContainerStatuses[*]}init:{.name}={.state.terminated.reason}{"\n"}{end}{range .status.containerStatuses[*]}app:{.name}={.state.running.startedAt}{"\n"}{end}'
```

The init container terminated successfully before nginx began its normal lifetime.

Cleanup:

```bash
kubectl delete pod init-demo
rm -f init-demo.yaml
```

## Native sidecar: start in init ordering, then stay alive

Native sidecars are restartable init containers.

They use:

```yaml
restartPolicy: Always
```

Unlike an ordinary init container, the sidecar does not need to finish before the application can keep running.

Let's prove that.

Save as `sidecar-demo.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sidecar-demo
spec:
  initContainers:
    - name: log-forwarder
      image: busybox:1.36
      restartPolicy: Always
      command:
        - sh
        - -c
        - |
          touch /logs/app.log
          tail -F /logs/app.log
      volumeMounts:
        - name: logs
          mountPath: /logs

  containers:
    - name: app
      image: busybox:1.36
      command:
        - sh
        - -c
        - |
          i=0
          while true; do
            i=$((i + 1))
            echo "application message $i" >> /logs/app.log
            sleep 2
          done
      volumeMounts:
        - name: logs
          mountPath: /logs

  volumes:
    - name: logs
      emptyDir: {}
```

Apply and wait:

```bash
kubectl apply -f sidecar-demo.yaml
kubectl wait \
  --for=condition=Ready \
  pod/sidecar-demo \
  --timeout=60s
```

Now read the sidecar logs:

```bash
kubectl logs sidecar-demo \
  -c log-forwarder \
  --tail=5
```

You should see the application messages even though the log-forwarder was declared under `initContainers`.

Inspect its state:

```bash
kubectl get pod sidecar-demo \
  -o jsonpath='{range .status.initContainerStatuses[*]}{.name}{" running="}{.state.running.startedAt}{" restarts="}{.restartCount}{"\n"}{end}'
```

The slightly surprising result is:

```text
spec.initContainers
        |
        +-- ordinary init container -> eventually terminates
        |
        +-- restartPolicy: Always   -> remains running as a sidecar
```

That is why native sidecars can participate in init ordering while still living for the Pod lifetime.

Good uses include:

- log forwarding
- local proxying
- configuration synchronisation
- security helpers

Use a sidecar when the supporting functionality genuinely belongs to the same Pod lifecycle.

Do not group unrelated services into one Pod merely because Kubernetes allows multiple containers.

Cleanup:

```bash
kubectl delete pod sidecar-demo
rm -f sidecar-demo.yaml
```

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

# 23. Who Is Allowed to Do What? Users, ServiceAccounts, RBAC and Admission [CKAD] [DEV]

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
---

# 24. SecurityContext and Container Privilege [CKAD]

Container runtime security should be part of the workload definition rather than an undocumented node-side convention.

A `securityContext` can exist at Pod level and container level.

Before building a secure Pod, deliberately ask Kubernetes for an impossible combination.

## Break it: require non-root without choosing a non-root user

Save as `root-forbidden.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: root-forbidden
spec:
  securityContext:
    runAsNonRoot: true

  containers:
    - name: shell
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
```

Apply:

```bash
kubectl apply -f root-forbidden.yaml
```

Inspect:

```bash
kubectl get pod root-forbidden
kubectl describe pod root-forbidden
```

The image normally runs as UID `0`, but the Pod says that root is forbidden.

The kubelet therefore cannot construct the requested container safely.

You should see a failure such as:

```text
CreateContainerConfigError
```

with an Event explaining that `runAsNonRoot` conflicts with a root runtime identity.

This is a useful distinction:

```text
image says
run as root
    |
    X
Pod securityContext says
must not run as root
```

Kubernetes did not silently weaken the requested security policy to make the container start.

Delete the failed Pod:

```bash
kubectl delete pod root-forbidden
rm -f root-forbidden.yaml
```

## Fix it: choose the runtime identity deliberately

Save as `secure-demo.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-demo
spec:
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault

  containers:
    - name: shell
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      securityContext:
        runAsUser: 10001
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop:
            - ALL
```

Apply and wait:

```bash
kubectl apply -f secure-demo.yaml
kubectl wait \
  --for=condition=Ready \
  pod/secure-demo \
  --timeout=60s
```

Inspect identity:

```bash
kubectl exec secure-demo -- id
```

You should see UID `10001` rather than root.

Prove the root filesystem is read-only:

```bash
kubectl exec secure-demo -- \
  sh -c 'touch /tmp/should-fail'
```

The write should fail.

Inspect the configured controls:

```bash
kubectl get pod secure-demo \
  -o jsonpath='{.spec.securityContext}{"\n"}{.spec.containers[0].securityContext}{"\n"}'
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

runAsUser
    -> choose a numeric runtime UID

allowPrivilegeEscalation: false
    -> process cannot gain more privileges than its parent

capabilities.drop
    -> remove specific Linux capabilities

readOnlyRootFilesystem
    -> make the container root filesystem read-only

seccompProfile: RuntimeDefault
    -> apply the runtime's default syscall filter
```

The broader lesson is the same as elsewhere in Kubernetes:

```text
security intent in spec
        |
        v
runtime tries to satisfy it
        |
        +-- possible   -> container runs
        |
        +-- impossible -> visible failure
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

# 26. Ingress: The Frozen HTTP API and the Road to Gateway API [CKAD] [DEV]

A ClusterIP Service gives an application a stable endpoint inside the cluster.

Users outside the cluster often need HTTP routing to that Service.

Historically, Kubernetes modelled that with `Ingress`.

An important distinction is:

> An Ingress object is configuration. An Ingress controller is the software that implements it.

That distinction is worth observing directly.

## Check whether anything implements Ingress

Ask the cluster for its available implementations:

```bash
kubectl get ingressclass
```

A stock kind cluster may return no classes at all.

That means the API server understands `Ingress`, but nothing is currently responsible for turning those objects into working HTTP listeners.

This is the same pattern we will later see with CRDs and controllers:

```text
API object exists
      |
      v
controller watches it
      |
      v
real behaviour appears
```

No controller means the middle step is missing.

## Create the API object anyway

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

Apply:

```bash
kubectl apply -f ingress.yaml
```

Inspect:

```bash
kubectl get ingress api
kubectl describe ingress api
```

Inspect status directly:

```bash
kubectl get ingress api \
  -o jsonpath='{.status.loadBalancer.ingress}{"\n"}'
```

If there is no controller, that status will normally remain empty and no HTTP listener will magically appear.

That is useful behaviour to understand:

```text
Ingress stored in API       yes
routing implementation      no
external traffic path       no
```

If your cluster already has a maintained Ingress controller, set the matching class:

```yaml
spec:
  ingressClassName: <class-name>
```

and follow that controller's documented exposure method.

The abstract path is still:

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

Ingress does not replace a Service.

It routes to one.

## Why we do not install an Ingress controller just for this lab

The Kubernetes project now recommends **Gateway API** instead of Ingress.

Ingress remains a stable API and is not being removed, but the API is frozen and no longer gaining features.

Also avoid old tutorials that tell you to install `ingress-nginx`: that project was retired in March 2026 and no longer receives fixes or security updates.

So the main cookbook keeps Ingress because it is still important Kubernetes and CKAD knowledge, but we do not introduce a legacy controller merely to make this one exercise route traffic.

Instead, the networking deep dive takes the modern path.

Continue with `cillium-gateay-appendix.md`, where we actually install and exercise Cilium's Gateway API implementation:

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

That appendix sends real traffic, breaks backend references, inspects status, exercises header routing, weighted backends, cross-namespace `ReferenceGrant`, and follows the implementation down through Envoy, Cilium and eBPF.

The important progression is:

```text
Ingress
  -> simple, stable, frozen HTTP routing API

Gateway API
  -> role-oriented, extensible service-networking APIs
```

For a broader tour of the Gateway API resource model and its routing features, Roman Glushko's deep dive is also excellent:

https://www.romaglushko.com/blog/k8s-gateway-api/

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

Let's hit that problem before solving it.

## First try ordinary `exec`

Pick one API Pod:

```bash
POD=$(kubectl get pod -l app=api \
  -o jsonpath='{.items[0].metadata.name}')

CONTAINER=$(kubectl get pod "$POD" \
  -o jsonpath='{.spec.containers[0].name}')

printf 'pod=%s container=%s\n' "$POD" "$CONTAINER"
```

Try to use `curl` inside the application container:

```bash
kubectl exec "$POD" -c "$CONTAINER" -- \
  curl -s http://127.0.0.1
```

Our nginx-based image does not normally contain `curl`, so the command should fail with an executable-not-found error.

That is not necessarily an image defect.

It can be a deliberate production-image choice.

## Add temporary tooling instead

Attach an ephemeral debugging container:

```bash
kubectl debug -it "$POD" \
  --image=busybox:1.36 \
  --target="$CONTAINER" \
  -- sh
```

Inside the debug container, call the application over the Pod's shared network namespace:

```sh
wget -qO- http://127.0.0.1
```

You can also inspect processes:

```sh
ps
```

Then exit:

```sh
exit
```

Inspect what Kubernetes added:

```bash
kubectl get pod "$POD" \
  -o jsonpath='{range .spec.ephemeralContainers[*]}{.name}{" image="}{.image}{" target="}{.targetContainerName}{"\n"}{end}'
```

The original application image did not change.

The Pod now has temporary debugging tooling attached to it.

Conceptually:

```text
minimal production container
        |
        | exec lacks tooling
        v
   debugging blocked
        |
        | kubectl debug
        v
ephemeral container joins Pod
        |
        +-- same Pod network
        +-- optional process targeting
        +-- extra tools
```

Ephemeral containers are intentionally different from normal application containers:

- they are added to an existing Pod for troubleshooting
- they are not part of the normal workload template
- they do not restart like ordinary workload containers
- they cannot define normal container resources such as ports or probes

Depending on the runtime and security configuration, process visibility and debugging capabilities can differ.

The model to keep is:

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
  image: nginx:1.27-alpine
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

      subresources:
        status: {}

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

            status:
              type: object
              properties:
                readyReplicas:
                  type: integer
                url:
                  type: string
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
kubectl explain previewenvironments.status
```

The CRD extended API discovery just like a built-in type.

The `status` subresource also gives a future controller somewhere separate to report observed state without pretending that status is user intent.

## Create a Custom Resource

Save as `preview.yaml`:

```yaml
apiVersion: platform.example.com/v1alpha1
kind: PreviewEnvironment
metadata:
  name: pr-482
spec:
  image: nginx:1.27-alpine
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

Leave `preview-crd.yaml` and `preview.yaml` in place.

The next chapter gives them behaviour.

---

# 34. Build a Tiny Go Controller [DEV] [DEEP DIVE]

Chapter 1 told us that Kubernetes is a control system.

Now we are going to write one of those control loops ourselves.

Our custom API says:

```yaml
kind: PreviewEnvironment
spec:
  image: nginx:1.27-alpine
  replicas: 2
```

We want that to cause:

```text
PreviewEnvironment
       |
       +-- Deployment
       |
       +-- Service
```

and we want the custom resource to report:

```yaml
status:
  readyReplicas: 2
  url: http://pr-482.cookbook.svc.cluster.local
```

That requires a controller.

## The smallest useful reconciliation loop

A production controller normally uses watches, informers, a work queue, retries and often leader election.

We are deliberately starting with something smaller:

```text
every 2 seconds
     |
     v
list PreviewEnvironments
     |
     v
for each one
     |
     +-- apply desired Deployment
     +-- apply desired Service
     +-- read observed Deployment status
     +-- update PreviewEnvironment status
```

Polling is not the architecture we would choose for a serious controller.

It is useful here because the reconciliation logic stays visible.

The controller uses **server-side apply** for its child resources. Re-running the same desired definition therefore converges instead of creating another Deployment every loop.

## Create the Go project

You need Go installed for this deep dive.

Check:

```bash
go version
```

Create a workspace:

```bash
mkdir -p /tmp/preview-controller
cd /tmp/preview-controller

go mod init example.com/preview-controller

go get \
  k8s.io/apimachinery@v0.35.0 \
  k8s.io/client-go@v0.35.0
```

`client-go` uses matching `v0.X.Y` versions for Kubernetes `v1.X.Y` releases, so `v0.35.0` aligns with our Kubernetes 1.35 target.

Save as `main.go`:

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

var (
	previewGVR = schema.GroupVersionResource{Group: "platform.example.com", Version: "v1alpha1", Resource: "previewenvironments"}
	deployGVR  = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	serviceGVR = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}
)

type controller struct {
	namespace string
	client    dynamic.Interface
}

func main() {
	cfg, err := kubeConfig()
	if err != nil {
		log.Fatal(err)
	}

	client, err := dynamic.NewForConfig(cfg)
	if err != nil {
		log.Fatal(err)
	}

	namespace := os.Getenv("NAMESPACE")
	if namespace == "" {
		namespace = "cookbook"
	}

	c := &controller{namespace: namespace, client: client}
	ctx := context.Background()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	log.Printf("reconciling PreviewEnvironments in %q", namespace)

	for {
		if err := c.reconcileAll(ctx); err != nil {
			log.Printf("reconcile: %v", err)
		}
		<-ticker.C
	}
}

func kubeConfig() (*rest.Config, error) {
	if cfg, err := rest.InClusterConfig(); err == nil {
		return cfg, nil
	}

	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		clientcmd.NewDefaultClientConfigLoadingRules(),
		&clientcmd.ConfigOverrides{},
	).ClientConfig()
}

func (c *controller) reconcileAll(ctx context.Context) error {
	previews := c.client.Resource(previewGVR).Namespace(c.namespace)
	list, err := previews.List(ctx, metav1.ListOptions{})
	if err != nil {
		return err
	}

	for i := range list.Items {
		preview := &list.Items[i]
		if preview.GetDeletionTimestamp() != nil {
			continue
		}
		if err := c.reconcile(ctx, preview); err != nil {
			log.Printf("%s: %v", preview.GetName(), err)
		}
	}
	return nil
}

func (c *controller) reconcile(ctx context.Context, preview *unstructured.Unstructured) error {
	name := preview.GetName()
	image, _, _ := unstructured.NestedString(preview.Object, "spec", "image")
	replicas, _, _ := unstructured.NestedInt64(preview.Object, "spec", "replicas")
	if image == "" || replicas < 1 {
		return fmt.Errorf("spec.image and spec.replicas are required")
	}

	labels := map[string]any{
		"app.kubernetes.io/name":       name,
		"platform.example.com/preview": name,
	}
	owner := []any{map[string]any{
		"apiVersion": "platform.example.com/v1alpha1",
		"kind":       "PreviewEnvironment",
		"name":       name,
		"uid":        string(preview.GetUID()),
		"controller": true,
	}}

	deployment := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "apps/v1",
		"kind":       "Deployment",
		"metadata": map[string]any{
			"name":            name,
			"namespace":       c.namespace,
			"ownerReferences": owner,
		},
		"spec": map[string]any{
			"replicas": replicas,
			"selector": map[string]any{"matchLabels": labels},
			"template": map[string]any{
				"metadata": map[string]any{"labels": labels},
				"spec": map[string]any{
					"containers": []any{map[string]any{
						"name":  "web",
						"image": image,
						"ports": []any{map[string]any{"containerPort": int64(80)}},
					}},
				},
			},
		},
	}}

	service := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "v1",
		"kind":       "Service",
		"metadata": map[string]any{
			"name":            name,
			"namespace":       c.namespace,
			"ownerReferences": owner,
		},
		"spec": map[string]any{
			"selector": labels,
			"ports": []any{map[string]any{
				"name":       "http",
				"port":       int64(80),
				"targetPort": int64(80),
			}},
		},
	}}

	if err := c.apply(ctx, deployGVR, deployment); err != nil {
		return err
	}
	if err := c.apply(ctx, serviceGVR, service); err != nil {
		return err
	}

	current, err := c.client.Resource(deployGVR).Namespace(c.namespace).
		Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	ready, _, _ := unstructured.NestedInt64(current.Object, "status", "readyReplicas")

	return c.updateStatus(ctx, preview, ready)
}

func (c *controller) apply(ctx context.Context, gvr schema.GroupVersionResource, obj *unstructured.Unstructured) error {
	body, err := json.Marshal(obj.Object)
	if err != nil {
		return err
	}

	force := true
	_, err = c.client.Resource(gvr).Namespace(c.namespace).Patch(
		ctx,
		obj.GetName(),
		types.ApplyPatchType,
		body,
		metav1.PatchOptions{FieldManager: "preview-controller", Force: &force},
	)
	return err
}

func (c *controller) updateStatus(ctx context.Context, preview *unstructured.Unstructured, ready int64) error {
	url := fmt.Sprintf("http://%s.%s.svc.cluster.local", preview.GetName(), c.namespace)
	oldReady, _, _ := unstructured.NestedInt64(preview.Object, "status", "readyReplicas")
	oldURL, _, _ := unstructured.NestedString(preview.Object, "status", "url")
	if oldReady == ready && oldURL == url {
		return nil
	}

	updated := preview.DeepCopy()
	_ = unstructured.SetNestedField(updated.Object, ready, "status", "readyReplicas")
	_ = unstructured.SetNestedField(updated.Object, url, "status", "url")

	_, err := c.client.Resource(previewGVR).Namespace(c.namespace).
		UpdateStatus(ctx, updated, metav1.UpdateOptions{})
	return err
}
```

Format and resolve dependencies:

```bash
gofmt -w main.go
go mod tidy
```

## Run the controller from your laptop first

The program first tries in-cluster credentials. If it is not running in Kubernetes, it falls back to your normal kubeconfig.

Make sure you are still pointed at the cookbook lab:

```bash
kubectl config current-context
kubectl config view --minify \
  -o jsonpath='{..namespace}{"\n"}'
```

Then run:

```bash
go run .
```

Leave it running.

In another terminal:

```bash
kubectl get preview,deployment,service,pods
```

The custom resource from Chapter 33 should now cause a Deployment and Service to appear.

Wait for the child Deployment to be created, then for its rollout:

```bash
kubectl wait   --for=create   deployment/pr-482   --timeout=30s

kubectl rollout status deployment/pr-482
```

Then inspect custom status:

```bash
kubectl get preview pr-482 \
  -o jsonpath='{.status.readyReplicas}{" ready -> "}{.status.url}{"\n"}'
```

You should eventually see:

```text
2 ready -> http://pr-482.cookbook.svc.cluster.local
```

The path is now real:

```text
PreviewEnvironment.spec
        |
        v
our Go controller
        |
        +-- server-side apply Deployment
        |
        +-- server-side apply Service
        |
        v
Deployment.status
        |
        v
PreviewEnvironment.status
```

## Change desired state

Change the custom resource rather than the generated Deployment:

```bash
kubectl patch preview pr-482 \
  --type=merge \
  -p '{"spec":{"replicas":3}}'
```

Watch:

```bash
kubectl get preview,deployment,pods -w
```

The controller sees the new desired state and changes the Deployment.

## Create drift on purpose

Now fight the controller.

Scale its child Deployment directly:

```bash
kubectl scale deployment pr-482 --replicas=1
```

Check immediately:

```bash
kubectl get deployment pr-482
```

Then check again a few seconds later:

```bash
sleep 3
kubectl get deployment pr-482
```

It should return to three replicas.

Why?

```text
PreviewEnvironment.spec.replicas = 3
              |
              v
controller observes child replicas = 1
              |
              v
server-side apply desired Deployment
              |
              v
child replicas = 3
```

This is Chapter 1's control loop implemented by code we wrote ourselves.

## Delete a child

Delete the generated Deployment:

```bash
kubectl delete deployment pr-482
```

Watch the labelled Deployment set rather than asking for the temporarily missing object by name:

```bash
kubectl get deployment   -l platform.example.com/preview=pr-482   -w
```

Within a reconciliation cycle, it should reappear.

Again, the controller is not issuing an imperative "restart" command.

It is repeatedly asserting:

```text
A Deployment named pr-482 should exist with this spec.
```

Press `Ctrl-C` in the terminal running `go run .` before the next step.

## Run the controller as a Kubernetes workload

Running from your laptop proved the control loop.

Now make the controller obey the same platform rules as every other workload.

Create a `Dockerfile`:

```dockerfile
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /controller .

FROM scratch
COPY --from=build /controller /controller
USER 65532:65532
ENTRYPOINT ["/controller"]
```

Build it:

```bash
docker build -t example/preview-controller:v1 .
```

Our lab is kind, so reuse the image-distribution lesson from Chapter 9:

```bash
kind load docker-image \
  example/preview-controller:v1 \
  --name ckad
```

## Give it only the API permissions it needs

Save as `controller-rbac.yaml`:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: preview-controller
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: preview-controller
rules:
  - apiGroups: ["platform.example.com"]
    resources:
      - previewenvironments
      - previewenvironments/status
    verbs:
      - get
      - list
      - watch
      - update
      - patch

  - apiGroups: ["apps"]
    resources:
      - deployments
    verbs:
      - get
      - list
      - watch
      - create
      - update
      - patch

  - apiGroups: [""]
    resources:
      - services
    verbs:
      - get
      - list
      - watch
      - create
      - update
      - patch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: preview-controller
subjects:
  - kind: ServiceAccount
    name: preview-controller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: preview-controller
```

Apply:

```bash
kubectl apply -f controller-rbac.yaml
```

Prove the scope before running anything:

```bash
kubectl auth can-i patch deployments \
  --as=system:serviceaccount:cookbook:preview-controller

kubectl auth can-i update previewenvironments/status \
  --api-group=platform.example.com \
  --as=system:serviceaccount:cookbook:preview-controller

kubectl auth can-i delete nodes \
  --as=system:serviceaccount:cookbook:preview-controller
```

The first two should be allowed.

Deleting Nodes should not be.

That connects our controller directly back to Chapter 23:

```text
controller needs API access
        |
        v
ServiceAccount identity
        |
        v
Role grants minimum namespace permissions
```

## Deploy the controller

Save as `controller-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: preview-controller
spec:
  replicas: 1

  selector:
    matchLabels:
      app: preview-controller

  template:
    metadata:
      labels:
        app: preview-controller

    spec:
      serviceAccountName: preview-controller

      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault

      containers:
        - name: controller
          image: example/preview-controller:v1
          imagePullPolicy: IfNotPresent

          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL

          env:
            - name: NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
```

Apply:

```bash
kubectl apply -f controller-deployment.yaml
kubectl rollout status deployment/preview-controller
```

Follow its logs:

```bash
kubectl logs deployment/preview-controller -f
```

The controller now uses:

- a ServiceAccount from the RBAC chapter
- namespace discovery from the Downward API chapter
- a hardened SecurityContext from Chapter 24
- a locally built image loaded into kind as in Chapter 9
- a custom API from Chapter 33
- server-side apply to express child desired state

This is why the earlier chapters matter.

They compose.

Leave the controller, CRD and `PreviewEnvironment/pr-482` running.

Chapter 35 will inspect the ownership and status relationships we just created.

## What we deliberately left out

Our controller polls every two seconds because that keeps the first implementation understandable.

A production controller normally evolves toward:

```text
watch / informer
      |
      v
work queue
      |
      v
reconcile(key)
      |
      +-- retry with backoff
      +-- status / conditions
      +-- metrics
      +-- leader election when replicated
```

Libraries such as `client-go` and `controller-runtime` provide those building blocks.

The essential idea does not change:

> Reconciliation should be idempotent. Running it repeatedly should converge the system toward the same desired state, not create more side effects every time.

---

# 35. Ownership, Finalizers, Status and Operators [DEV] [DEEP DIVE]

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

---

# 36. Clean Up the Custom API [DEV]

We deliberately kept the controller running so Chapters 34 and 35 could build on the same system.

Clean it up in dependency order.

## Delete the Custom Resource

```bash
kubectl delete preview pr-482 --ignore-not-found
```

Its owned Deployment and Service should disappear through garbage collection.

Check:

```bash
kubectl get deployment,service \
  -l platform.example.com/preview=pr-482
```

## Delete the controller workload and RBAC

```bash
kubectl delete -f controller-deployment.yaml --ignore-not-found
kubectl delete -f controller-rbac.yaml --ignore-not-found
```

## Delete the CRD

```bash
kubectl delete crd \
  previewenvironments.platform.example.com
```

Deleting a CRD deletes the custom resources stored through that API.

Only do this casually in a disposable lab environment.

## Remove the local lab files

If you created the Go controller under `/tmp`:

```bash
rm -rf /tmp/preview-controller
```

Remove manifests from the current directory if present:

```bash
rm -f \
  preview.yaml \
  preview-crd.yaml \
  controller-rbac.yaml \
  controller-deployment.yaml
```

We have now traversed the full extension lifecycle:

```text
CRD
  -> API type exists

Custom Resource
  -> desired state exists

Controller
  -> behaviour exists

ownerReferences
  -> child relationships exist

status
  -> observed state is reported

finalizers
  -> external cleanup can become part of deletion
```

That is the same Kubernetes control model, extended with our own API and code.

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

## Security boundaries answer different questions

```text
authentication
    -> who are you?

authorization / RBAC
    -> may you make this API request?

admission
    -> is this write acceptable?

scheduling controls
    -> where may this workload run?

NetworkPolicy
    -> which network flows are allowed?

infrastructure IAM / SSH
    -> who may administer the actual machines?
```

Namespaces help provide scope, but are not an automatic security boundary by themselves.

For stronger tenancy, separate tenant Kubernetes APIs/control planes can add another boundary; see `multitenancy-appendix.md`.

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

Supplemental deep dive:

- Gateway API concepts and hands-on Cilium Gateway API in `cillium-gateay-appendix.md`

---

# Appendix C - Official References

Prefer current official documentation when a field, API version or exam detail is uncertain.

- Kubernetes documentation: https://kubernetes.io/docs/
- Kubernetes API reference: https://kubernetes.io/docs/reference/kubernetes-api/
- kubectl reference: https://kubernetes.io/docs/reference/kubectl/
- CKAD certification: https://www.cncf.io/training/certification/ckad/
- Linux Foundation CKAD page: https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/
- Gateway API documentation: https://gateway-api.sigs.k8s.io/
- client-go: https://github.com/kubernetes/client-go
- client-go controller architecture: https://github.com/kubernetes/client-go/blob/master/ARCHITECTURE.md
- Roman Glushko Gateway API deep dive: https://www.romaglushko.com/blog/k8s-gateway-api/

The habit this cookbook is trying to teach is simple:

> Do not memorise Kubernetes as a pile of resource definitions. Learn the control loops and relationships, then let the API tell you the exact syntax.
