We already have:

```text
Git
  |
  v
Argo CD
  |
  v
Rollout/web
  |
  v
ReplicaSets
```

We are going to keep that delivery chain.

We will change only the progressive-delivery strategy.

The blue-green controller needs two Services:

```text
web
  active production traffic

web-preview
  pre-production validation traffic
```

Argo Rollouts will dynamically add a ReplicaSet hash to those Service selectors so that each Service points at exactly the intended version.

That creates an important ownership question.

## Who owns the Service selector?

Our Service currently lives in Git:

```yaml
spec:
  selector:
    app: web
```

For blue-green, Argo Rollouts will turn the live selector into something conceptually like:

```yaml
spec:
  selector:
    app: web
    rollouts-pod-template-hash: 6d997f5c6
```

That hash changes as releases change.

If Argo CD insists that the selector must always exactly match the static Git version, we create another reconciliation fight:

```text
Argo Rollouts:
  selector must point at ReplicaSet v4

Argo CD:
  selector must equal Git exactly
```

We have already seen this class of problem with `Deployment.spec.replicas`.

The solution is the same:

> Define field ownership deliberately.

Git still owns:

```text
Service identity
ports
protocol
application labels
```

Argo Rollouts owns during blue-green delivery:

```text
the live Service selector used to choose the active/preview ReplicaSet
```

## Give Rollouts ownership of the dynamic selectors

First inspect our current Argo CD exception:

```bash
kubectl get application web-dev \
  -n argocd \
  -o yaml \
  | grep -A30 ignoreDifferences
```

We already ignore the Deployment replica field used during `workloadRef` migration.

Replace the ignore list with all three controller-owned fields:

```bash
kubectl patch application web-dev \
  -n argocd \
  --type merge \
  -p '{
    "spec": {
      "ignoreDifferences": [
        {
          "group": "apps",
          "kind": "Deployment",
          "name": "web",
          "namespace": "web-dev",
          "jsonPointers": ["/spec/replicas"]
        },
        {
          "group": "",
          "kind": "Service",
          "name": "web",
          "namespace": "web-dev",
          "jsonPointers": ["/spec/selector"]
        },
        {
          "group": "",
          "kind": "Service",
          "name": "web-preview",
          "namespace": "web-dev",
          "jsonPointers": ["/spec/selector"]
        }
      ],
      "syncPolicy": {
        "automated": {
          "prune": true,
          "selfHeal": true
        },
        "syncOptions": [
          "CreateNamespace=true",
          "RespectIgnoreDifferences=true"
        ]
      }
    }
  }'
```

Verify:

```bash
kubectl get application web-dev \
  -n argocd \
  -o yaml \
  | grep -A45 ignoreDifferences
```

The important lesson is not the exact Argo syntax.

It is this:

```text
multiple controllers
        |
        v
must have a coherent ownership model
```

## Restore our analysis gate

The previous chapter deliberately made the analysis endpoint fail.

Set it back to healthy before the next experiment:

```bash
kubectl patch configmap analysis-gate \
  -n web-dev \
  --type merge \
  -p '{"data":{"result.json":"{\"ok\": true}\n"}}'
```

Restart the tiny gate workload so there is no ambiguity about what it serves:

```bash
kubectl rollout restart deployment/analysis-gate \
  -n web-dev
```

Check it:

```bash
kubectl run analysis-check \
  -n web-dev \
  --rm -i --restart=Never \
  --image=curlimages/curl \
  -- \
  curl -s http://analysis-gate/result.json
```

Expected:

```json
{"ok": true}
```

## Add the preview Service to Git

Move to the GitOps repository:

```bash
cd ~/gitops-lab/platform-gitops

git checkout main
git pull

git checkout -b platform/blue-green
```

Create the preview Service:

```bash
cat > apps/web/base/web-preview.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web-preview
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
EOF
```

Add it to the base Kustomization:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path("apps/web/base/kustomization.yaml")
s = p.read_text()
if "  - web-preview.yaml\n" not in s:
    s = s.replace("resources:\n", "resources:\n  - web-preview.yaml\n")
p.write_text(s)
PY
```

## Change the Rollout strategy

Replace the canary policy with blue-green:

```bash
cat > apps/web/base/rollout.yaml <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: web
spec:
  replicas: 5
  revisionHistoryLimit: 5
  rollbackWindow:
    revisions: 3
  selector:
    matchLabels:
      app: web
  workloadRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
    scaleDown: progressively
  strategy:
    blueGreen:
      activeService: web
      previewService: web-preview
      previewReplicaCount: 2
      autoPromotionEnabled: false
      scaleDownDelaySeconds: 60
      prePromotionAnalysis:
        templates:
          - templateName: web-health
EOF
```

There are several important controls here.

### `activeService`

```yaml
activeService: web
```

This is the production Service.

Argo Rollouts controls which ReplicaSet it selects.

### `previewService`

```yaml
previewService: web-preview
```

This gives us an endpoint for the new version **before** promotion.

### `previewReplicaCount`

```yaml
previewReplicaCount: 2
```

Our Rollout wants five replicas in steady state.

During preview we only need two copies to validate the version.

This saves some temporary capacity:

```text
active:   5 replicas
preview:  2 replicas
```

Before promotion, Rollouts scales the preview version to the required active size.

### `autoPromotionEnabled`

```yaml
autoPromotionEnabled: false
```

Even after the preview is healthy, production does not switch automatically.

The rollout pauses until we explicitly promote it.

### `prePromotionAnalysis`

```yaml
prePromotionAnalysis:
  templates:
    - templateName: web-health
```

Our existing AnalysisTemplate runs **before the active Service switches**.

That gives us:

```text
new version ready
      |
      v
analysis
      |
  +---+---+
  |       |
pass     fail
  |       |
  v       v
pause   abort
  |
manual promotion
  |
active Service switches
```

### `scaleDownDelaySeconds`

```yaml
scaleDownDelaySeconds: 60
```

After promotion, Rollouts keeps the old active ReplicaSet around briefly.

There are two reasons this is useful:

```text
network rule propagation
+
rapid rollback window
```

The default is already conservative, but a minute makes the behaviour easy to observe in our lab.

### `rollbackWindow`

```yaml
rollbackWindow:
  revisions: 3
```

Recent revisions can be fast-tracked if Git moves back to them.

That is particularly useful in a GitOps system:

```text
bad release
   |
Git revert
   |
old digest becomes desired again
   |
Rollouts recognises recent revision
   |
fast rollback
```

## Render before committing

Do not use Git as a YAML syntax checker.

Render the overlay locally:

```bash
kubectl kustomize environments/dev/web \
  > /tmp/web-blue-green.yaml
```

Check that it contains:

```bash
grep -nE 'kind: Rollout|kind: Service|name: web-preview|blueGreen:' \
  /tmp/web-blue-green.yaml
```

Ask the API server to validate it without changing the cluster:

```bash
kubectl apply \
  --dry-run=server \
  -f /tmp/web-blue-green.yaml \
  >/dev/null
```

Now commit the platform change:

```bash
git add apps/web/base

git commit -m "add blue-green delivery strategy"

git push -u origin platform/blue-green
```

Create a pull request:

```bash
gh pr create \
  --title "Use blue-green delivery for web" \
  --body "Add a preview Service and move web from canary steps to an Argo Rollouts blue-green strategy."
```

Review it.

Then merge it:

```bash
gh pr merge \
  --merge \
  --delete-branch
```

Return to main:

```bash
git checkout main
git pull
```

Watch Argo CD reconcile:

```bash
kubectl get application web-dev \
  -n argocd \
  -w
```

In another terminal inspect the Rollout:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev
```

And the Services:

```bash
kubectl get service web web-preview \
  -n web-dev
```

At steady state, both Services may initially point at the current stable ReplicaSet.

The interesting behaviour appears on the next release.
