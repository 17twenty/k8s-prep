Change the application page:

```bash
cd ~/gitops-lab/web-app

cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <h1>GitOps demo</h1>
    <p>version: v2</p>
  </body>
</html>
EOF
```

Commit and push:

```bash
git add index.html
git commit -m "release v2"
git push
```

Your CI should:

```text
build v2
push it
capture digest
open GitOps PR
```

Merge the promotion PR.

Now watch Argo Rollouts:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev \
  --watch
```

The rollout should reach:

```text
20% canary
PAUSED
```

With five replicas and no dedicated traffic router, the weight is represented approximately by replica count.

Inspect Pods:

```bash
kubectl get pods \
  -n web-dev \
  -l app=web \
  -o wide
```

You should see old and new ReplicaSets coexisting.

This is the same mechanism you learned for Deployments, but now the transition has explicit programmable steps.

## Send traffic

Port-forward the Service:

```bash
kubectl port-forward \
  -n web-dev \
  service/web \
  8082:80
```

From another terminal, make several requests:

```bash
for i in $(seq 1 20); do
  curl -s http://127.0.0.1:8082 \
    | grep version
  sleep 0.2
done
```

Depending on connection reuse and Service load balancing you should observe both versions over repeated independent requests.

For exact 5%, 10%, header-based, or mirrored traffic, we need a traffic-management layer rather than relying only on replica ratios.

We will return to that later.
