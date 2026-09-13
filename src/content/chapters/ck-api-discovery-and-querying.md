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
