Now deliberately violate the model.

Git says:

```yaml
replicas: 2
```

Change the live Deployment:

```bash
kubectl scale deployment/web \
  -n web-dev \
  --replicas=7
```

Check:

```bash
kubectl get deployment web \
  -n web-dev
```

We now have:

```text
Git desired state:       2 replicas
cluster actual state:    7 replicas
```

Ask Argo:

```bash
kubectl get application web-dev \
  -n argocd \
  -o jsonpath='{.status.sync.status}{"\n"}'
```

After reconciliation catches up, it should report:

```text
OutOfSync
```

But notice that Argo has not necessarily repaired it.

Automated synchronization of new Git revisions and automatic repair of live drift are separate choices.

## Enable self-healing

Patch the Application:

```bash
kubectl patch application web-dev \
  -n argocd \
  --type merge \
  -p '{
    "spec": {
      "syncPolicy": {
        "automated": {
          "selfHeal": true
        },
        "syncOptions": ["CreateNamespace=true"]
      }
    }
  }'
```

Watch the Deployment:

```bash
kubectl get deployment web \
  -n web-dev \
  -w
```

It should return to:

```text
2 replicas
```

We just created the higher-level equivalent of deleting a Pod from a Deployment.

The important hierarchy is now:

```text
Git says 2
   |
   v
Argo CD restores Deployment.spec.replicas=2
   |
   v
Deployment controller restores two Pods
```

Two controllers are reconciling two different layers of desired state.
