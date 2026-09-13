Add the Clastix chart repository:

```bash
helm repo add clastix https://clastix.github.io/charts
helm repo update
```

Install Kamaji:

```bash
helm upgrade --install kamaji clastix/kamaji \
  --namespace kamaji-system \
  --create-namespace \
  --set 'resources=null' \
  --version 0.0.0+latest
```

Watch the installation:

```bash
kubectl get pods \
  -n kamaji-system \
  -w
```

Then verify that Kamaji extended the Kubernetes API:

```bash
kubectl get crds \
  | grep -i kamaji
```

This should already look familiar:

```text
install operator
      |
      v
new CRD appears
      |
      v
new declarative API available
```
