Later you may build your own container image locally.

For example:

```bash
docker build -t my-app:v1 .
```

That image exists on your machine, but it does **not automatically exist inside the kind node**.

Load it:

```bash
kind load docker-image my-app:v1 --name ckad
```

Then Kubernetes can use it:

```bash
kubectl run my-app \
  --image=my-app:v1 \
  --image-pull-policy=IfNotPresent
```

This:

```text
docker build
     |
     v
Host image
     |
     | kind load docker-image
     v
kind node
     |
     v
Pod
```

is useful when testing applications without pushing every image to a registry.

Avoid using the `latest` tag for this workflow. Kubernetes normally treats `:latest` as `imagePullPolicy: Always`, which may cause it to try pulling the image from a registry instead of using the image you loaded locally.
