Suppose CI does this after every merge:

```bash
docker build -t registry.example.com/web:latest .
docker push registry.example.com/web:latest
kubectl set image deployment/web \
  web=registry.example.com/web:latest
```

It works.

It also quietly creates several problems.

CI needs credentials capable of modifying the cluster.

The production state may differ from anything committed to Git.

A mutable tag such as `latest` does not uniquely identify the bytes being deployed.

A failed CI system can leave the cluster half-mutated.

Auditing becomes:

```text
What is running?
Who changed it?
Which pipeline ran?
Which image did latest mean at that moment?
```

GitOps changes the direction of authority.

Instead of:

```text
CI ---> cluster
```

we use:

```text
CI ---> Git
         |
         v
     controller ---> cluster
```

The cluster-side controller continuously compares:

```text
Git desired state
       |
       | compare
       v
cluster actual state
```

and reconciles differences.

If this sounds familiar, it should.

Kubernetes already taught us:

```text
spec
 |
 v
controller
 |
 v
actual state
```

GitOps adds another reconciliation layer:

```text
Git
 |
 v
GitOps controller
 |
 v
Kubernetes spec
 |
 v
Kubernetes controllers
 |
 v
actual state
```

The important idea is not "YAML in Git".

The important idea is:

> A versioned, reviewable source of desired state is continuously reconciled by software running near the target system.
