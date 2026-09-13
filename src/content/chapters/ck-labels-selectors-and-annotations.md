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
