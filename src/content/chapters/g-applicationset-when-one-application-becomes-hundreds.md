Creating one Argo `Application` by hand is fine.

Creating 500 nearly-identical Application objects manually is not.

Argo CD provides `ApplicationSet` to generate Applications from data.

Conceptually:

```text
list of clusters / directories / tenants
            |
            v
       ApplicationSet
            |
            v
    many Applications
            |
            v
       many reconciliations
```

A simplified list example:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: web-environments
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - env: dev
            namespace: web-dev
          - env: staging
            namespace: web-staging
  template:
    metadata:
      name: 'web-{{env}}'
    spec:
      project: web-team
      source:
        repoURL: https://github.com/example/platform-gitops.git
        targetRevision: main
        path: 'environments/{{env}}/web'
      destination:
        server: https://kubernetes.default.svc
        namespace: '{{namespace}}'
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

Do not use ApplicationSet merely because it exists.

Use it when the repetition itself is data-driven.

Typical platform examples include:

```text
one app per cluster
one app per tenant
one app per region
one environment directory per service
```

This is the GitOps version of moving from hand-created Pods to controllers.
