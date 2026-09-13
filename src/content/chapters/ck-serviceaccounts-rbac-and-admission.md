When a human or workload talks to the Kubernetes API, several separate questions are involved.

```text
Authentication
    -> who are you?

Authorization
    -> may you perform this action?

Admission
    -> even if authorized, is this object acceptable and should it be mutated?
```

Keeping these stages separate avoids a lot of confusion.

## ServiceAccount: workload identity

A ServiceAccount represents an identity for workloads inside Kubernetes.

Create one:

```bash
kubectl create serviceaccount api-sa
```

Inspect:

```bash
kubectl get serviceaccount api-sa -o yaml
```

Modern Kubernetes uses short-lived projected ServiceAccount credentials rather than relying on automatically created permanent token Secrets.

Request a temporary token when the cluster allows it:

```bash
kubectl create token api-sa
```

Assign the ServiceAccount to our Deployment:

```bash
kubectl set serviceaccount deployment/api api-sa
```

Wait:

```bash
kubectl rollout status deployment/api
```

Check:

```bash
kubectl get deployment api \
  -o jsonpath='{.spec.template.spec.serviceAccountName}{"\n"}'
```

Expected:

```text
api-sa
```

## RBAC: authorize actions

Create a Role that can read Pods.

Save as `rbac.yaml`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: api-sa-pod-reader
subjects:
  - kind: ServiceAccount
    name: api-sa
    namespace: cookbook
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: pod-reader
```

Apply:

```bash
kubectl apply -f rbac.yaml
```

Ask Kubernetes whether that identity may list Pods:

```bash
kubectl auth can-i list pods \
  --as=system:serviceaccount:cookbook:api-sa
```

Expected on a lab where your current identity is allowed to impersonate:

```text
yes
```

Ask whether it may delete Pods:

```bash
kubectl auth can-i delete pods \
  --as=system:serviceaccount:cookbook:api-sa
```

Expected:

```text
no
```

RBAC objects connect like this:

```text
ServiceAccount
      |
      v
RoleBinding
      |
      v
Role
      |
      v
allowed API verbs/resources
```

## Role vs ClusterRole

A `Role` contains namespaced permissions.

A `ClusterRole` can contain cluster-wide permissions and can also be bound within a namespace.

Likewise:

```text
RoleBinding        -> binding scoped to a namespace
ClusterRoleBinding -> binding across the cluster
```

For CKAD, the key is being able to read and construct the relationship rather than memorising every possible API verb.

## Admission control

After authentication and authorization, admission controllers can validate or mutate an API request.

Examples of things that may be enforced through admission include:

- Pod security requirements
- quotas
- policy rules
- injected defaults or sidecars in some platforms

This explains a useful failure class:

```text
I am authenticated
      |
      v
I am authorized
      |
      v
API request still rejected
      |
      v
check admission or policy error
```

Cleanup only the RBAC lab objects, but keep the ServiceAccount because the Deployment currently uses it:

```bash
kubectl delete -f rbac.yaml
rm -f rbac.yaml
```
