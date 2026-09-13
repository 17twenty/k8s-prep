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
