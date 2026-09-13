Reconciliation must answer two questions:

```text
What should exist?

and

What should no longer exist?
```

Create a ConfigMap in Git:

```bash
cd ~/gitops-lab/platform-gitops

cat > apps/web/base/banner.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-banner
data:
  message: hello-from-git
EOF
```

Add it to the base Kustomization:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path("apps/web/base/kustomization.yaml")
s = p.read_text()
if "  - banner.yaml\n" not in s:
    s = s.replace("  - service.yaml\n", "  - service.yaml\n  - banner.yaml\n")
p.write_text(s)
PY
```

Commit and push:

```bash
git add .
git commit -m "add banner config"
git push
```

Wait for Argo:

```bash
kubectl get configmap web-banner \
  -n web-dev \
  -w
```

Now remove the object from Git:

```bash
rm apps/web/base/banner.yaml

python3 - <<'PY'
from pathlib import Path
p = Path("apps/web/base/kustomization.yaml")
s = p.read_text().replace("  - banner.yaml\n", "")
p.write_text(s)
PY

git add .
git commit -m "remove banner config"
git push
```

Inspect the cluster:

```bash
kubectl get configmap web-banner \
  -n web-dev
```

If automated pruning is disabled, the object may remain even though Git no longer declares it.

The Application becomes out of sync.

## Enable pruning

Patch the Application:

```bash
kubectl patch application web-dev \
  -n argocd \
  --type merge \
  -p '{
    "spec": {
      "syncPolicy": {
        "automated": {
          "prune": true,
          "selfHeal": true
        },
        "syncOptions": ["CreateNamespace=true"]
      }
    }
  }'
```

Argo should now remove resources that were previously managed but no longer exist in desired state.

Check:

```bash
kubectl get configmap web-banner \
  -n web-dev
```

Expected:

```text
NotFound
```

Pruning is powerful.

In production, think carefully before allowing automatic pruning of high-impact resources such as namespaces, storage resources, or shared infrastructure.

Argo also supports requiring explicit confirmation before certain prune/delete operations.
