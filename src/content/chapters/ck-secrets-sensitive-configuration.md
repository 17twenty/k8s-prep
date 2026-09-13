Some configuration is sensitive enough that it should not be mixed casually with ordinary ConfigMaps.

Kubernetes provides the `Secret` API type.

Create one:

```bash
kubectl create secret generic api-secret \
  --from-literal=username=developer \
  --from-literal=password=correct-horse
```

Inspect metadata:

```bash
kubectl get secret api-secret
```

View YAML:

```bash
kubectl get secret api-secret -o yaml
```

Values under `data` are base64 encoded.

Decode one:

```bash
kubectl get secret api-secret \
  -o jsonpath='{.data.username}' | base64 -d

echo
```

Base64 is **encoding, not encryption**.

The security value of a Secret comes from Kubernetes access controls and how the cluster protects Secret data, not from base64.

## `stringData`

Declarative Secrets can avoid manual base64 encoding:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: example-secret
type: Opaque
stringData:
  token: example-value
```

The API server converts `stringData` into the encoded `data` representation.

## Consume a Secret as an environment variable

Patch the Deployment:

```bash
kubectl patch deployment api --type=strategic -p '
spec:
  template:
    spec:
      containers:
        - name: nginx
          env:
            - name: API_USERNAME
              valueFrom:
                secretKeyRef:
                  name: api-secret
                  key: username
'
```

Wait for rollout:

```bash
kubectl rollout status deployment/api
```

Inspect one Pod:

```bash
POD=$(kubectl get pods -l app=api -o jsonpath='{.items[0].metadata.name}')
kubectl exec "$POD" -- printenv API_USERNAME
```

Expected:

```text
developer
```

Use real secret-management controls in production rather than committing plaintext Secret manifests to Git.
