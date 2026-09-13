Your cluster now exists.

Continue with **Section 0 - Lab Setup**.

Create the cookbook namespace:

```bash
kubectl create namespace cookbook
```

Make it the default namespace:

```bash
kubectl config set-context \
  --current \
  --namespace=cookbook
```

Check:

```bash
kubectl config view --minify \
  -o jsonpath='{..namespace}{"\n"}'
```

Expected:

```text
cookbook
```

You are now ready for the rest of the cookbook.
