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
