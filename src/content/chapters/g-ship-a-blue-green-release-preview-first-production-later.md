Now we will ship a version whose lifecycle is deliberately visible.

The application change still begins in the **application repository**.

That is important.

We do not edit the GitOps repository by hand to invent a release.

The application CI builds an immutable artifact and proposes its digest for promotion.

## Create the next application version

Move to the application repository:

```bash
cd ~/gitops-lab/web-app

git checkout main
git pull
```

Change the page:

```bash
cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <h1>GitOps demo</h1>
    <p>version: blue-green-v4</p>
  </body>
</html>
EOF
```

Commit and push:

```bash
git add index.html

git commit -m "release blue-green v4"

git push
```

The application CI should now perform the chain we built earlier:

```text
commit
  |
  v
build image
  |
  v
push image
  |
  v
resolve immutable digest
  |
  v
open promotion PR against GitOps repository
```

Inspect the promotion PR:

```bash
gh pr list \
  --repo "${GITHUB_USER}/${GITOPS_REPO_NAME}"
```

Open the diff and verify that the important change is an immutable digest rather than `latest`:

```text
old digest
    ↓
new digest
```

Merge the promotion PR.

## Watch the preview environment appear

Watch the Rollout:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

The new ReplicaSet should be created and become the preview version.

Because we set:

```yaml
previewReplicaCount: 2
```

we expect approximately:

```text
stable ReplicaSet:   5 Pods
preview ReplicaSet:  2 Pods
```

Inspect them:

```bash
kubectl get rs,pods \
  -n web-dev \
  -l app=web
```

Now look at the Service selectors:

```bash
kubectl get service web web-preview \
  -n web-dev \
  -o custom-columns='SERVICE:.metadata.name,HASH:.spec.selector.rollouts-pod-template-hash,APP:.spec.selector.app'
```

You should see different hashes while the new version is awaiting promotion:

```text
SERVICE       HASH         APP
web           <old-hash>   web
web-preview   <new-hash>   web
```

This is the blue-green boundary made concrete.

Argo Rollouts has changed routing without changing either Service's identity.

## Talk to production

Port-forward the active Service:

```bash
kubectl port-forward \
  -n web-dev \
  service/web \
  8082:80
```

From another terminal:

```bash
curl -s http://127.0.0.1:8082 \
  | grep version
```

You should still see the **currently active** version.

The new release exists, but production has not moved.

## Talk directly to preview

Open another terminal and port-forward the preview Service:

```bash
kubectl port-forward \
  -n web-dev \
  service/web-preview \
  8083:80
```

Now query it:

```bash
curl -s http://127.0.0.1:8083 \
  | grep version
```

Expected:

```text
version: blue-green-v4
```

We have now personally observed:

```text
active Service  ---> old version
preview Service ---> new version
```

That is the core of blue-green delivery.

## Validate the preview like a real platform would

A human can perform a smoke test:

```bash
curl -fsS http://127.0.0.1:8083 >/dev/null \
  && echo "preview responds successfully"
```

You could also run:

```text
integration tests
synthetic transactions
schema compatibility checks
browser automation
security tests
performance smoke tests
```

Our Rollout has already run `web-health` as a pre-promotion AnalysisRun.

Inspect it:

```bash
kubectl get analysisrun \
  -n web-dev \
  --sort-by=.metadata.creationTimestamp
```

Describe the newest one:

```bash
LATEST_ANALYSIS=$(kubectl get analysisrun \
  -n web-dev \
  --sort-by=.metadata.creationTimestamp \
  -o jsonpath='{.items[-1:].metadata.name}')

kubectl describe analysisrun \
  -n web-dev \
  "$LATEST_ANALYSIS"
```

At this point we know:

```text
image built successfully
        |
image was pulled successfully
        |
Pods became Ready
        |
preview endpoint works
        |
automated gate passed
        |
production still serves old version
```

This is a much stronger decision point than:

```text
CI job went green -> deploy everything
```

## Promote the preview

When satisfied, promote it:

```bash
kubectl argo rollouts promote web \
  -n web-dev
```

Watch:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

During promotion, Rollouts will ensure the new ReplicaSet reaches the full desired size before switching production traffic.

Inspect the Services again:

```bash
kubectl get service web web-preview \
  -n web-dev \
  -o custom-columns='SERVICE:.metadata.name,HASH:.spec.selector.rollouts-pod-template-hash'
```

Both should now point at the new ReplicaSet hash.

Re-run the production request:

```bash
curl -s http://127.0.0.1:8082 \
  | grep version
```

Now production should say:

```text
version: blue-green-v4
```

The important operation was not replacing the Service.

The Service stayed stable:

```text
web.web-dev.svc.cluster.local
```

Argo Rollouts changed **which ReplicaSet that stable identity selected**.

## Observe the old version before it disappears

Immediately after promotion:

```bash
kubectl get rs \
  -n web-dev \
  -l app=web
```

The old active ReplicaSet should remain scaled for roughly our configured delay:

```yaml
scaleDownDelaySeconds: 60
```

Watch it:

```bash
kubectl get rs \
  -n web-dev \
  -l app=web \
  -w
```

Eventually the old ReplicaSet scales down.

This delay is intentionally different from keeping old ReplicaSet metadata around.

Kubernetes may retain the old ReplicaSet object for revision history even after its replica count reaches zero.

The distinction is:

```text
revision retained
        !=
old application still consuming full compute
```
