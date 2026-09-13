Before adding virtual or hosted control planes, establish the baseline.

Make sure we are on the cookbook cluster:

```bash
kubectl config use-context kind-ckad
```

Save the provider/host context. We will use this later because vCluster changes our current context for us:

```bash
export HOST_CONTEXT=$(kubectl config current-context)
echo "$HOST_CONTEXT"
```

Expected:

```text
kind-ckad
```

Create a namespace for Alice:

```bash
kubectl create namespace shared-alice
```

Create a small developer Role:

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: developer
  namespace: shared-alice
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "services"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "create", "update", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: alice-developer
  namespace: shared-alice
subjects:
  - kind: User
    name: alice
    apiGroup: rbac.authorization.k8s.io
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: developer
EOF
```

Because our kind administrator may impersonate users, we can ask the API server what Alice would be allowed to do:

```bash
kubectl auth can-i get pods \
  --as=alice \
  -n shared-alice
```

Expected:

```text
yes
```

She may create a Deployment in her namespace:

```bash
kubectl auth can-i create deployments.apps \
  --as=alice \
  -n shared-alice
```

Expected:

```text
yes
```

But she cannot create arbitrary namespaces:

```bash
kubectl auth can-i create namespaces \
  --as=alice
```

Expected:

```text
no
```

Nor delete Nodes:

```bash
kubectl auth can-i delete nodes \
  --as=alice
```

Expected:

```text
no
```

The model is:

```text
Alice
  |
  v
same kube-apiserver as everyone else
  |
  v
RBAC
  |
  +-- shared-alice namespace    some access
  +-- cluster-scoped objects    mostly no access
  +-- other tenant namespaces   no access unless granted
```

This is a legitimate tenancy model for many internal platforms.

But Alice still talks to the **same Kubernetes API** as everybody else.

That is the limitation we will explore next.
