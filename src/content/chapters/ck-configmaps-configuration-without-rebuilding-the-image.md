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
