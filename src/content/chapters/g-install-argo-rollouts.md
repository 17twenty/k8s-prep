Create the namespace:

```bash
kubectl create namespace argo-rollouts
```

Install the controller:

```bash
kubectl apply \
  -n argo-rollouts \
  -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
```

Wait:

```bash
kubectl rollout status \
  deployment/argo-rollouts \
  -n argo-rollouts \
  --timeout=300s
```

On macOS, install the kubectl plugin:

```bash
brew install argoproj/tap/kubectl-argo-rollouts
```

Check:

```bash
kubectl argo rollouts version
```

Find the new APIs:

```bash
kubectl api-resources \
  | grep argoproj
```

You should now see resources including:

```text
Rollout
AnalysisTemplate
AnalysisRun
Experiment
```

Again, a product feature has become Kubernetes API objects plus controllers.
