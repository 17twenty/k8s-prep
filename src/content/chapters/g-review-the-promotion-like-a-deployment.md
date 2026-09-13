Open the generated GitOps PR.

The important diff should effectively be:

```diff
 images:
   - name: example/web
-    newName: nginx
-    newTag: 1.27-alpine
+    newName: ghcr.io/example/web-app
+    digest: sha256:...
```

Before merging, ask:

```text
Did CI pass?
Is the image signed?
Did vulnerability policy pass?
Does the digest correspond to the intended source commit?
Is this environment allowed to consume it?
```

Merge the PR.

Then watch Argo rather than running `kubectl apply`:

```bash
kubectl get application web-dev \
  -n argocd \
  -w
```

Watch Kubernetes underneath it:

```bash
kubectl get deployment,rs,pods \
  -n web-dev \
  -w
```

You should recognise the same rollout machinery from the Kubernetes cookbook.

Git changed.

Argo changed the Deployment desired state.

The Deployment controller changed ReplicaSets and Pods.

The hierarchy is:

```text
Git commit
    |
    v
Argo Application
    |
    v
Deployment.spec.template
    |
    v
ReplicaSet
    |
    v
Pods
```

## Prove which image is running

Ask Kubernetes:

```bash
kubectl get deployment web \
  -n web-dev \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

You should see the digest-pinned image reference.

Now Git history and cluster state can be connected directly.
