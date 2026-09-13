Reconnect:

```bash
vcluster connect alice \
  --namespace tenant-alice
```

Look at the tenant Pod:

```bash
kubectl get pods \
  -n apps \
  -o wide
```

Switch back to the host:

```bash
vcluster disconnect
kubectl config use-context "$HOST_CONTEXT"
```

Then:

```bash
kubectl get pods \
  -n tenant-alice \
  -o wide
```

You have just observed the complete path:

```text
kubectl
   |
   v
Alice tenant kube-apiserver
   |
   v
tenant Pod object
   |
   v
vCluster syncer
   |
   v
provider kube-apiserver
   |
   v
translated Pod
   |
   v
provider scheduler
   |
   v
provider node / kubelet
```

When the provider-side Pod changes status, vCluster synchronizes that observation back to the tenant API.

So even here we are still using the same control-loop model from Chapter 1:

```text
desired tenant object
       |
       v
translation / reconciliation
       |
       v
provider object
       |
       v
actual workload
       |
       v
status flows back
```
