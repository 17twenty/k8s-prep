One of the best features of `kind` is that the entire cluster is disposable.

Destroy it:

```bash
kind delete cluster --name ckad
```

Check:

```bash
kind get clusters
```

Then recreate it whenever you want:

```bash
kind create cluster \
  --name ckad \
  --image kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0 \
  --wait 2m
```

A completely broken lab is therefore not a disaster.

Sometimes deleting it and starting again is exactly the point.
