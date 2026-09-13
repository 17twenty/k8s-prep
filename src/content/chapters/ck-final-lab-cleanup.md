The easiest cleanup is deleting the namespace because nearly everything in this cookbook is namespaced:

```bash
kubectl delete namespace cookbook
```

If you changed your current context to default to `cookbook`, clear or change that namespace afterwards.

For example:

```bash
kubectl config set-context \
  --current \
  --namespace=default
```

Check:

```bash
kubectl config view --minify \
  -o jsonpath='{..namespace}{"\n"}'
```
