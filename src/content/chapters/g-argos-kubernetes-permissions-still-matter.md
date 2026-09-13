GitOps does not abolish RBAC.

It moves the actor.

With imperative deployment:

```text
developer / CI identity
        |
        v
Kubernetes RBAC
```

With Argo:

```text
developer
   |
   v
Git permissions
   |
   v
Argo controller identity
   |
   v
Kubernetes RBAC
```

Ask which ServiceAccounts exist:

```bash
kubectl get serviceaccounts \
  -n argocd
```

Inspect the controller identity:

```bash
kubectl get pod \
  -n argocd \
  -l app.kubernetes.io/name=argocd-application-controller \
  -o jsonpath='{.items[0].spec.serviceAccountName}{"\n"}'
```

Then inspect bindings involving Argo:

```bash
kubectl get clusterrolebinding \
  -o yaml \
  | grep -n -C 3 argocd
```

The standard lab installation is deliberately powerful.

That is convenient for one local cluster.

A production platform should answer explicitly:

```text
Which clusters may this Argo instance manage?
Which namespaces?
Which cluster-scoped resources?
Which teams may change its sources and destinations?
```

Never assume "GitOps" means "secure" by default.

It gives us a better control model; we still have to configure that model responsibly.
