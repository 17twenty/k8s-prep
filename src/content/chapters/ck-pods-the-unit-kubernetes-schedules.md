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
