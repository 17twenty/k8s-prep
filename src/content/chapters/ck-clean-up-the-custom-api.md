Delete the Custom Resource first:

```bash
kubectl delete preview pr-482
```

Delete the CRD:

```bash
kubectl delete crd \
  previewenvironments.platform.example.com
```

Deleting a CRD deletes the custom resources stored through that API.

Only do this casually in a disposable lab environment.

Remove local files:

```bash
rm -f preview.yaml preview-crd.yaml
```
