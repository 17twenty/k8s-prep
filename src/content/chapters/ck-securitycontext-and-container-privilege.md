Container runtime security should be part of the workload definition rather than an undocumented node-side convention.

A `securityContext` can exist at Pod level and container level.

Save as `secure-demo.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-demo
spec:
  securityContext:
    runAsNonRoot: true

  containers:
    - name: shell
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      securityContext:
        runAsUser: 10001
        allowPrivilegeEscalation: false
        capabilities:
          drop:
            - ALL
```

Apply:

```bash
kubectl apply -f secure-demo.yaml
```

Inspect identity:

```bash
kubectl exec secure-demo -- id
```

Inspect the configured container security context:

```bash
kubectl get pod secure-demo \
  -o jsonpath='{.spec.containers[0].securityContext}{"\n"}'
```

Useful controls include:

```text
runAsNonRoot
runAsUser
runAsGroup
fsGroup
allowPrivilegeEscalation
readOnlyRootFilesystem
capabilities
seccompProfile
```

Do not treat these as synonyms.

For example:

```text
runAsNonRoot
    -> refuse a root runtime identity

allowPrivilegeEscalation: false
    -> process cannot gain more privileges than its parent

capabilities.drop
    -> remove specific Linux capabilities

readOnlyRootFilesystem
    -> make the container root filesystem read-only
```

Cleanup:

```bash
kubectl delete pod secure-demo
rm -f secure-demo.yaml
```
