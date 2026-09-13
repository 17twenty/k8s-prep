We deliberately kept the controller running so Chapters 34 and 35 could build on the same system.

Clean it up in dependency order.

## Delete the Custom Resource

```bash
kubectl delete preview pr-482 --ignore-not-found
```

Its owned Deployment and Service should disappear through garbage collection.

Check:

```bash
kubectl get deployment,service \
  -l platform.example.com/preview=pr-482
```

## Delete the controller workload and RBAC

```bash
kubectl delete -f controller-deployment.yaml --ignore-not-found
kubectl delete -f controller-rbac.yaml --ignore-not-found
```

## Delete the CRD

```bash
kubectl delete crd \
  previewenvironments.platform.example.com
```

Deleting a CRD deletes the custom resources stored through that API.

Only do this casually in a disposable lab environment.

## Remove the local lab files

If you created the Go controller under `/tmp`:

```bash
rm -rf /tmp/preview-controller
```

Remove manifests from the current directory if present:

```bash
rm -f \
  preview.yaml \
  preview-crd.yaml \
  controller-rbac.yaml \
  controller-deployment.yaml
```

We have now traversed the full extension lifecycle:

```text
CRD
  -> API type exists

Custom Resource
  -> desired state exists

Controller
  -> behaviour exists

ownerReferences
  -> child relationships exist

status
  -> observed state is reported

finalizers
  -> external cleanup can become part of deletion
```

That is the same Kubernetes control model, extended with our own API and code.
