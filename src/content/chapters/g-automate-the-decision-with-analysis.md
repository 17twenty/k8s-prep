Manual promotion is useful while learning.

A mature delivery system usually evaluates signals automatically.

Examples:

```text
HTTP error rate
latency
saturation
queue depth
business conversion
synthetic checks
smoke-test webhook
```

Argo Rollouts represents this using:

```text
AnalysisTemplate
      |
      v
AnalysisRun
      |
      v
measurement
      |
  +---+---+
  |       |
success failure
  |       |
  v       v
continue abort
```

## A tiny runnable analysis gate

For the lab, create a static JSON health endpoint.

This is deliberately simpler than Prometheus so we can see the mechanism first.

Create:

```bash
cat > /tmp/analysis-gate.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: analysis-gate
  namespace: web-dev
data:
  result.json: |
    {"ok": true}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analysis-gate
  namespace: web-dev
spec:
  replicas: 1
  selector:
    matchLabels:
      app: analysis-gate
  template:
    metadata:
      labels:
        app: analysis-gate
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
          volumeMounts:
            - name: data
              mountPath: /usr/share/nginx/html
      volumes:
        - name: data
          configMap:
            name: analysis-gate
---
apiVersion: v1
kind: Service
metadata:
  name: analysis-gate
  namespace: web-dev
spec:
  selector:
    app: analysis-gate
  ports:
    - port: 80
      targetPort: 80
EOF

kubectl apply -f /tmp/analysis-gate.yaml
```

Test it:

```bash
kubectl run curl-test \
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

Create an AnalysisTemplate in the GitOps repository:

```bash
cd ~/gitops-lab/platform-gitops

cat > apps/web/base/analysis.yaml <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: web-health
spec:
  metrics:
    - name: release-gate
      successCondition: result == true
      failureLimit: 1
      provider:
        web:
          url: http://analysis-gate.web-dev.svc.cluster.local/result.json
          jsonPath: "{$.ok}"
EOF
```

Add it to Kustomize:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path("apps/web/base/kustomization.yaml")
s = p.read_text()
if "  - analysis.yaml\n" not in s:
    s = s.replace("resources:\n", "resources:\n  - analysis.yaml\n")
p.write_text(s)
PY
```

Now change the Rollout steps so analysis occurs after the 20% canary:

```yaml
  strategy:
    canary:
      steps:
        - setWeight: 20
        - pause:
            duration: 10s
        - analysis:
            templates:
              - templateName: web-health
        - setWeight: 50
        - pause:
            duration: 20s
        - setWeight: 100
```

Commit and push the GitOps change.

Then trigger another image promotion.

Inspect generated AnalysisRuns:

```bash
kubectl get analysisrun \
  -n web-dev
```

Describe one:

```bash
kubectl describe analysisrun \
  -n web-dev \
  <analysis-run-name>
```

## Make the gate fail

Change the ConfigMap:

```bash
kubectl patch configmap analysis-gate \
  -n web-dev \
  --type merge \
  -p '{"data":{"result.json":"{\"ok\": false}\n"}}'
```

Wait for the projected ConfigMap volume to update, or restart the gate Pod:

```bash
kubectl rollout restart deployment/analysis-gate \
  -n web-dev
```

Trigger another release.

The AnalysisRun should fail and the Rollout should abort rather than progressing.

## Production translation

The static gate is only teaching the API.

A real platform would normally query a measurement system such as Prometheus:

```text
success rate >= 99.5%
p95 latency < 300 ms
error rate < 1%
```

The concept remains identical.
