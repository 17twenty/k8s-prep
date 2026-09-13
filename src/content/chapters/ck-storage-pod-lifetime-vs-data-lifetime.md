Containers and Pods are replaceable.

Data is often not.

Kubernetes therefore separates workload lifetime from storage lifetime.

## `emptyDir`: data that belongs to a Pod

We already used `emptyDir` in the multi-container example.

Its lifetime is tied to the Pod:

```text
container restart
      |
      v
emptyDir remains

Pod deletion
      |
      v
emptyDir disappears
```

This makes it useful for:

- scratch space
- caches
- sharing files between containers in one Pod

It is not durable application storage.

## PersistentVolumeClaim: ask the cluster for durable storage

A Pod should not usually care whether storage is backed by EBS, Ceph, local disks, NFS or another implementation.

It asks for storage through a PersistentVolumeClaim.

First inspect StorageClasses:

```bash
kubectl get storageclass
```

Save as `pvc.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

Apply:

```bash
kubectl apply -f pvc.yaml
```

Inspect:

```bash
kubectl get pvc data
```

If your cluster has a default dynamic provisioner, the claim should become `Bound`.

If it remains `Pending`, inspect:

```bash
kubectl describe pvc data
```

The cluster may not have a default StorageClass or suitable PersistentVolume.

That is a platform capability issue rather than a YAML syntax issue.

## Prove that data can outlive a Pod

Assuming the claim is `Bound`, create a writer Pod.

Save as `pvc-writer.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pvc-writer
spec:
  containers:
    - name: writer
      image: busybox:1.36
      command: ["sh", "-c", "echo persistent-data > /data/message; sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data
```

Apply:

```bash
kubectl apply -f pvc-writer.yaml
```

Wait:

```bash
kubectl wait \
  --for=condition=Ready \
  pod/pvc-writer \
  --timeout=60s
```

Check:

```bash
kubectl exec pvc-writer -- cat /data/message
```

Delete the Pod:

```bash
kubectl delete pod pvc-writer
```

Now create a different Pod using the same claim.

Save as `pvc-reader.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pvc-reader
spec:
  containers:
    - name: reader
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data
```

Apply:

```bash
kubectl apply -f pvc-reader.yaml
```

Read:

```bash
kubectl exec pvc-reader -- cat /data/message
```

Expected:

```text
persistent-data
```

The first Pod is gone.

The claim remained.

That is the useful boundary:

```text
Pod lifetime != persistent data lifetime
```

Cleanup:

```bash
kubectl delete pod pvc-reader --ignore-not-found
kubectl delete pvc data
rm -f pvc.yaml pvc-writer.yaml pvc-reader.yaml
```
