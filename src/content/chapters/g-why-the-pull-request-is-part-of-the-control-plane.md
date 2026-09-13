It is tempting to think of the PR as bureaucracy around the "real deployment".

In this model, the PR **is part of the deployment control plane**.

The pull request is where we can perform controls before desired state changes:

```text
code review
policy checks
security scan result
change ticket reference
ownership approval
release notes
blast-radius review
```

A production branch might require:

```text
2 reviewers
CODEOWNERS approval
successful policy checks
signed commits
no direct pushes
```

The deployment itself remains automatic after the desired-state decision is accepted.

That separation is important:

```text
human decides what should happen
        |
        v
controller performs it consistently
```

Humans should not need to manually reproduce deployment mechanics on every release.
