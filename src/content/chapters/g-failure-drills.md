A delivery system is not understood until you have watched it fail.

Run these deliberately in the lab.

## Drill 1 - Git changes to an invalid image digest

Set the GitOps image to a nonexistent digest.

Observe:

```text
Argo: desired state accepted
Kubernetes: ImagePullBackOff
Application health: degraded / progressing
```

Question:

> Which controller is functioning correctly, and where is reconciliation blocked?

## Drill 2 - Delete a managed Pod

```bash
kubectl delete pod \
  -n web-dev \
  -l app=web
```

Observe the Rollout/ReplicaSet restore it without any Git change.

## Drill 3 - Scale live state manually

Change replica count with `kubectl`.

Observe Argo self-heal return it to Git.

## Drill 4 - Remove a manifest from Git

Observe prune behaviour.

## Drill 5 - Break repository access

Temporarily point the Application at a repository/path Argo cannot read.

Observe:

```bash
kubectl describe application web-dev \
  -n argocd
```

## Drill 6 - Abort a canary but do not revert Git

Observe the tension between:

```text
stable runtime state
```

and:

```text
new desired Git state
```

Then repair it properly with a revert.

## Drill 7 - Stop Argo CD

Scale the application controller down in the lab.

Observe that running workloads continue.

GitOps is a reconciliation mechanism, not the runtime dataplane.

Restore the controller and observe reconciliation resume.
