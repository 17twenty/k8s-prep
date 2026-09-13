Before calling a GitOps delivery platform production-ready, be able to answer all of these.

## Artifact

```text
[ ] Is every release associated with an immutable digest?
[ ] Is the same digest promoted through environments?
[ ] Are release tags immutable where practical?
[ ] Are artifacts vulnerability scanned?
[ ] Is an SBOM available?
[ ] Are artifacts signed / attested?
[ ] Is signature/provenance verification enforced somewhere?
```

## CI

```text
[ ] Does CI avoid general Kubernetes credentials?
[ ] Are registry credentials scoped?
[ ] Is GitOps write access scoped to the required repository/path?
[ ] Is automation represented by a machine identity, not a person's token?
[ ] Can the build identity be audited?
```

## Git

```text
[ ] Are production branches protected?
[ ] Are CODEOWNERS / reviewers appropriate?
[ ] Is direct push disabled where required?
[ ] Can every production digest be traced to a reviewed change?
[ ] Is rollback performed through source-of-truth changes?
```

## Argo CD

```text
[ ] Are AppProjects explicit rather than relying on default?
[ ] Are source repositories restricted?
[ ] Are destination namespaces/clusters restricted?
[ ] Is Argo's own Kubernetes RBAC understood?
[ ] Is access to the argocd namespace tightly controlled?
[ ] Are prune and self-heal policies deliberate?
[ ] Are Argo upgrades and backups planned?
```

## Progressive delivery

```text
[ ] Is rollout strategy appropriate for the service?
[ ] Are canary signals meaningful?
[ ] Can a release be aborted quickly?
[ ] Is there a documented Git rollback path?
[ ] Are automated analyses observable and auditable?
[ ] Is traffic shaping coarse replica ratio or real routed traffic by design?
```

## Secrets

```text
[ ] Are plaintext production secrets kept out of ordinary Git history?
[ ] Is secret rotation supported?
[ ] Can workloads access only the secrets they need?
```

## Operations

```text
[ ] Can you identify source commit -> image digest -> GitOps commit -> running Pods?
[ ] Are reconciliation failures alerted?
[ ] Are OutOfSync and Degraded applications visible?
[ ] Are stuck/aborted Rollouts visible?
[ ] Have failure drills actually been run?
```

If several answers are "we assume so", keep building.
