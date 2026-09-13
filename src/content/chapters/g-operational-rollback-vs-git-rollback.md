We need two different concepts:

```text
ABORT
  stop exposing a bad release now

REVERT
  change desired state back to the known-good artifact
```

The abort is an operational safety action.

The Git revert makes the desired state honest again.

## Revert the promotion

In the GitOps repository, identify the merge commit that promoted v3:

```bash
cd ~/gitops-lab/platform-gitops

git log --oneline --decorate -10
```

Create a revert branch:

```bash
git checkout main
git pull

git checkout -b rollback/web-v3

git revert <PROMOTION_MERGE_COMMIT>
```

Push it:

```bash
git push -u origin rollback/web-v3
```

Open a pull request:

```bash
gh pr create \
  --title "Rollback web v3" \
  --body "Restore the previous known-good image digest after canary abort."
```

Merge it.

Argo CD sees Git return to the previous digest.

Argo Rollouts now has desired state that agrees with the stable version.

The system converges again.

## Why not `kubectl set image` to v2?

Because that would create another hidden live mutation:

```text
cluster says v2
Git says v3
```

Self-healing GitOps would eventually try to restore v3.

Emergency commands are fine when the system is burning.

But the source of truth must subsequently be corrected.
