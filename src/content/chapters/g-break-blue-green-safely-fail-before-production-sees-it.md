Now let's make blue-green earn its keep.

We will deliberately create a release that:

```text
builds successfully
runs successfully
becomes Ready
```

but fails our release gate.

That is more interesting than a broken container image because Kubernetes itself considers the workload healthy enough to run.

Our **delivery policy** rejects it.

## Make the gate fail first

Set our analysis endpoint to false:

```bash
kubectl patch configmap analysis-gate \
  -n web-dev \
  --type merge \
  -p '{"data":{"result.json":"{\"ok\": false}\n"}}'
```

Restart the tiny gate:

```bash
kubectl rollout restart deployment/analysis-gate \
  -n web-dev
```

Verify:

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
{"ok": false}
```

## Build another perfectly runnable release

Move to the application repository:

```bash
cd ~/gitops-lab/web-app
```

Create v5:

```bash
cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <h1>GitOps demo</h1>
    <p>version: blue-green-v5-REJECT-ME</p>
  </body>
</html>
EOF
```

Commit and push:

```bash
git add index.html

git commit -m "release blue-green v5 for failed gate lab"

git push
```

Again, CI should build and push the image, resolve the digest, and open a GitOps promotion PR.

Merge that PR.

## Watch the new version appear only behind preview

Watch:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

The preview ReplicaSet should start normally.

Inspect Services:

```bash
kubectl get service web web-preview \
  -n web-dev \
  -o custom-columns='SERVICE:.metadata.name,HASH:.spec.selector.rollouts-pod-template-hash'
```

And inspect the analysis:

```bash
kubectl get analysisrun \
  -n web-dev \
  --sort-by=.metadata.creationTimestamp
```

The new pre-promotion analysis should fail.

Inspect it:

```bash
LATEST_ANALYSIS=$(kubectl get analysisrun \
  -n web-dev \
  --sort-by=.metadata.creationTimestamp \
  -o jsonpath='{.items[-1:].metadata.name}')

kubectl describe analysisrun \
  -n web-dev \
  "$LATEST_ANALYSIS"
```

The Rollout should enter an aborted/degraded state rather than switching the active Service.

## Prove production never moved

Query the active Service:

```bash
curl -s http://127.0.0.1:8082 \
  | grep version
```

It should still be the known-good version:

```text
version: blue-green-v4
```

Query preview:

```bash
curl -s http://127.0.0.1:8083 \
  | grep version
```

Depending on the precise aborted state and cleanup timing, the preview Service may still expose the rejected ReplicaSet long enough to debug it.

The critical fact is:

```text
active Service did not switch
```

Production never needed a rollback because production never received the rejected release.

That is blue-green's nicest failure mode.

## But Git still asks for v5

We have the same desired-state issue we saw during the canary abort.

Operational state says:

```text
v4 is serving safely
v5 was rejected
```

Git still says:

```text
v5 digest is desired
```

So the Rollout is correctly unhealthy/degraded.

It has not forgotten what we asked for.

Again:

```text
protecting production
        !=
fixing desired state
```

## Revert the promotion through Git

Move to the GitOps repository:

```bash
cd ~/gitops-lab/platform-gitops

git checkout main
git pull
```

Find the v5 promotion commit:

```bash
git log --oneline --decorate -10
```

Create a rollback branch:

```bash
git checkout -b rollback/blue-green-v5
```

Revert the promotion merge:

```bash
git revert <V5_PROMOTION_MERGE_COMMIT>
```

Push it:

```bash
git push -u origin rollback/blue-green-v5
```

Open the rollback PR:

```bash
gh pr create \
  --title "Rollback rejected blue-green v5" \
  --body "Restore the last known-good digest after pre-promotion analysis rejected v5."
```

Review and merge it.

Then:

```bash
git checkout main
git pull
```

Watch Argo CD and Argo Rollouts converge:

```bash
kubectl get application web-dev \
  -n argocd \
  -w
```

and:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

Because we configured:

```yaml
rollbackWindow:
  revisions: 3
```

returning Git to a recent ReplicaSet can be fast-tracked instead of needlessly replaying the entire progressive-delivery process.

## Restore the analysis gate

Leave the lab in a healthy state:

```bash
kubectl patch configmap analysis-gate \
  -n web-dev \
  --type merge \
  -p '{"data":{"result.json":"{\"ok\": true}\n"}}'
```

Restart it:

```bash
kubectl rollout restart deployment/analysis-gate \
  -n web-dev
```
