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
