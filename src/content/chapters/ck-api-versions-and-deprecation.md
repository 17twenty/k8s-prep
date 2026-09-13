Kubernetes evolves.

Old manifests found in blogs and repositories can reference API versions the current cluster no longer serves.

Do not blindly reuse them.

Ask the cluster.

Supported resources:

```bash
kubectl api-resources
```

Supported API versions:

```bash
kubectl api-versions
```

Deployment schema:

```bash
kubectl explain deployment
```

Deployment strategy:

```bash
kubectl explain deployment.spec.strategy
```

Ingress paths:

```bash
kubectl explain ingress.spec.rules.http.paths
```

## Validate before changing the cluster

Client-side dry run checks local construction:

```bash
kubectl apply \
  --dry-run=client \
  -f manifest.yaml
```

Server-side dry run asks the API server to process the request without persisting it:

```bash
kubectl apply \
  --dry-run=server \
  -f manifest.yaml
```

Server-side validation is especially useful when you want current cluster schema and admission behaviour to participate.

A reliable workflow is:

```text
old example found online
      |
      v
kubectl api-resources / api-versions
      |
      v
kubectl explain
      |
      v
server-side dry run
      |
      v
apply
```
