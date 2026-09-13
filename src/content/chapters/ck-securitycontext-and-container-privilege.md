Container runtime security should be part of the workload definition rather than an undocumented node-side convention.

A `securityContext` can exist at Pod level and container level.

Before building a secure Pod, deliberately ask Kubernetes for an impossible combination.

## Break it: require non-root without choosing a non-root user

Save as `root-forbidden.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: root-forbidden
spec:
  securityContext:
    runAsNonRoot: true

  containers:
    - name: shell
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
```

Apply:

```bash
kubectl apply -f root-forbidden.yaml
```

Inspect:

```bash
kubectl get pod root-forbidden
kubectl describe pod root-forbidden
```

The image normally runs as UID `0`, but the Pod says that root is forbidden.

The kubelet therefore cannot construct the requested container safely.

You should see a failure such as:

```text
CreateContainerConfigError
```

with an Event explaining that `runAsNonRoot` conflicts with a root runtime identity.

This is a useful distinction:

```text
image says
run as root
    |
    X
Pod securityContext says
must not run as root
```

Kubernetes did not silently weaken the requested security policy to make the container start.

Delete the failed Pod:

```bash
kubectl delete pod root-forbidden
rm -f root-forbidden.yaml
```

## Fix it: choose the runtime identity deliberately

Save as `secure-demo.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-demo
spec:
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault

  containers:
    - name: shell
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      securityContext:
        runAsUser: 10001
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop:
            - ALL
```

Apply and wait:

```bash
kubectl apply -f secure-demo.yaml
kubectl wait \
  --for=condition=Ready \
  pod/secure-demo \
  --timeout=60s
```

Inspect identity:

```bash
kubectl exec secure-demo -- id
```

You should see UID `10001` rather than root.

Prove the root filesystem is read-only:

```bash
kubectl exec secure-demo -- \
  sh -c 'touch /tmp/should-fail'
```

The write should fail.

Inspect the configured controls:

```bash
kubectl get pod secure-demo \
  -o jsonpath='{.spec.securityContext}{"\n"}{.spec.containers[0].securityContext}{"\n"}'
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

runAsUser
    -> choose a numeric runtime UID

allowPrivilegeEscalation: false
    -> process cannot gain more privileges than its parent

capabilities.drop
    -> remove specific Linux capabilities

readOnlyRootFilesystem
    -> make the container root filesystem read-only

seccompProfile: RuntimeDefault
    -> apply the runtime's default syscall filter
```

The broader lesson is the same as elsewhere in Kubernetes:

```text
security intent in spec
        |
        v
runtime tries to satisfy it
        |
        +-- possible   -> container runs
        |
        +-- impossible -> visible failure
```

Cleanup:

```bash
kubectl delete pod secure-demo
rm -f secure-demo.yaml
```
