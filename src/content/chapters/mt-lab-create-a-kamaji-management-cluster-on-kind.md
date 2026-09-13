Kamaji's official kind walkthrough is intended for development and learning only.

We will create a **separate** kind cluster named `kamaji`.

Prerequisites:

```text
docker
kind
kubectl
helm
jq
```

Create the management cluster:

```bash
kind create cluster --name kamaji
```

Verify:

```bash
kubectl config current-context
```

Expected:

```text
kind-kamaji
```

Save the context:

```bash
export KAMAJI_CONTEXT=$(kubectl config current-context)
```
