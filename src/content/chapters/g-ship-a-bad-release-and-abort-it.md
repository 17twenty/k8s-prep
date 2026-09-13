Now make v3 deliberately obvious and undesirable.

```bash
cd ~/gitops-lab/web-app

cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <h1>GitOps demo</h1>
    <p>version: v3-BAD</p>
  </body>
</html>
EOF

git add index.html
git commit -m "ship intentionally bad v3"
git push
```

Let CI create the promotion PR and merge it.

Watch until the canary pauses:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

Suppose testing or metrics say the version is bad.

Abort the rollout immediately:

```bash
kubectl argo rollouts abort web \
  -n web-dev
```

Inspect:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev
```

The stable ReplicaSet should be restored to serve the workload.

But we have a subtle problem.

Git still says:

```text
v3 digest is desired
```

Argo Rollouts says:

```text
v3 rollout is aborted
stable v2 is serving
```

The emergency action protected users.

It did **not** change the source of truth.

This distinction is fundamental.
