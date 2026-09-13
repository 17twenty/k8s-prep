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
