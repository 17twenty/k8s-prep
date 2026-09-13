A tempting migration is:

```text
change kind: Deployment
          to Rollout
```

For a throwaway manifest that can be enough.

For a running workload, it hides an important ownership problem.

If a Deployment and Rollout temporarily exist with overlapping selectors, both controllers can be active at the same time.

And if Argo CD keeps enforcing a Deployment replica count while Argo Rollouts is trying to scale that Deployment down during migration, two reconcilers can fight over the same field.

That gives us a better lab.

We will migrate using a Rollout `workloadRef`.

The existing Deployment remains the source of the Pod template.

The Rollout becomes responsible for progressive delivery.

Conceptually:

```text
Git / Kustomize
      |
      v
Deployment Pod template
      |
      | workloadRef
      v
Rollout
      |
      +-- manages progressive ReplicaSets
      |
      +-- scales old Deployment down
```

## First decide who owns `Deployment.spec.replicas`

Our Argo Application currently has self-healing enabled.

Git says the original Deployment has:

```yaml
replicas: 2
```

But during migration, Argo Rollouts needs to scale that Deployment down.

If both controllers insist on owning the same field, we can create a reconciliation tug-of-war:

```text
Git / Argo CD:       replicas must be 2
Argo Rollouts:       replicas must be 0
```

The fix is not to disable reconciliation globally.

The fix is to define field ownership deliberately.

Tell Argo CD to ignore the replica field of this specific Deployment, and to respect that exclusion during sync:

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

Check the relevant part:

```bash
kubectl get application web-dev \
  -n argocd \
  -o yaml \
  | grep -A20 ignoreDifferences
```

This is an important general GitOps pattern:

> If another controller legitimately owns a field, do not make your GitOps controller continuously overwrite it.

HPAs, progressive-delivery controllers, service meshes and other operators can all create this kind of shared ownership.

## Add the Rollout

In the GitOps repository:

```bash
cd ~/gitops-lab/platform-gitops
```

Keep the existing Deployment.

Create a Rollout that references it:

```bash
cat > apps/web/base/rollout.yaml <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: web
spec:
  replicas: 5
  selector:
    matchLabels:
      app: web
  workloadRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
    scaleDown: progressively
  strategy:
    canary:
      steps:
        - setWeight: 20
        - pause: {}
        - setWeight: 50
        - pause:
            duration: 30s
        - setWeight: 100
EOF
```

Add it to the base Kustomization:

```bash
python3 - <<'PY2'
from pathlib import Path
p = Path("apps/web/base/kustomization.yaml")
s = p.read_text()
if "  - rollout.yaml\n" not in s:
    s = s.replace("resources:\n", "resources:\n  - rollout.yaml\n")
p.write_text(s)
PY2
```

Do **not** remove the Deployment.

The Rollout is using its Pod template through `workloadRef`.

Render the desired state:

```bash
kubectl kustomize environments/dev/web
```

You should see both:

```text
Deployment/web
Rollout/web
```

That is intentional during this migration pattern.

Commit and push:

```bash
git add .
git commit -m "migrate web delivery to Argo Rollouts"
git push
```

Watch the two controllers:

```bash
kubectl get deployment,rollout,rs,pods \
  -n web-dev \
  -w
```

Inspect the Rollout:

```bash
kubectl argo rollouts get rollout web \
  -n web-dev
```

The Rollout should establish its own stable ReplicaSet while progressively scaling down the old Deployment-managed workload.

Inspect the original Deployment:

```bash
kubectl get deployment web \
  -n web-dev
```

Its replica count can now be changed by the Rollouts controller without Argo CD immediately restoring the Git value.

## Where does the image live now?

Because we used `workloadRef`, the Pod template still lives on the Deployment:

```bash
kubectl get deployment web \
  -n web-dev \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Our existing Kustomize image override therefore continues to work exactly where it did before.

When a promotion PR changes the Deployment Pod template image, Argo Rollouts observes the referenced workload change and performs the canary transition.

This gives us a clean division of ownership:

```text
Git / Argo CD
  owns Deployment Pod template
  owns Rollout policy

Argo Rollouts
  owns progressive ReplicaSets
  owns migration scaling

Kubernetes
  owns Pod execution and status
```

The migration itself has taught us something broader than Argo Rollouts:

> Multiple controllers can cooperate safely only when we understand which fields and resources each controller owns.
