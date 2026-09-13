The deployment system is production software too.

Monitor it.

Useful questions include:

```text
Is Argo able to read Git?
Are Applications OutOfSync?
Are Applications Degraded?
How long do syncs take?
Are Rollouts paused or aborted?
Are AnalysisRuns failing?
Can nodes pull images?
Did registry scanning fail?
Are promotion PRs stuck?
```

A useful event chain for one release is:

```text
source commit
    |
    v
CI run
    |
    v
image digest
    |
    v
promotion PR
    |
    v
Git merge commit
    |
    v
Argo sync revision
    |
    v
Rollout revision
    |
    v
ReplicaSet
    |
    v
Pods
```

Preserving those identifiers makes incident response dramatically easier.

Good platform metadata might include:

```text
source git SHA
image digest
GitOps commit SHA
service name
environment
owner
release timestamp
```
