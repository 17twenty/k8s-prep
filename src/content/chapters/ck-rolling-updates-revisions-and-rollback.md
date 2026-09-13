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
