Applications sometimes need metadata about the Pod they are running inside.

Hard-coding it would defeat the purpose of replaceable Pods.

The Downward API can expose selected Pod fields as environment variables or files.

Save as `downward.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: downward
  labels:
    app: downward-demo
spec:
  containers:
    - name: shell
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      env:
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        - name: POD_IP
          valueFrom:
            fieldRef:
              fieldPath: status.podIP
```

Apply:

```bash
kubectl apply -f downward.yaml
```

Query from inside the container:

```bash
kubectl exec downward -- printenv POD_NAME
kubectl exec downward -- printenv POD_NAMESPACE
kubectl exec downward -- printenv POD_IP
```

The application learned runtime identity from the platform rather than from a baked image or hand-written config file.

Cleanup:

```bash
kubectl delete pod downward
rm -f downward.yaml
```
