Now we connect the application repository to the GitOps repository.

The application CI should **not** merge directly into production desired state.

It should propose a change.

Conceptually:

```text
new image digest
      |
      v
branch in GitOps repo
      |
      v
pull request
      |
      +-- CI checks
      +-- policy checks
      +-- human review
      |
      v
merge
      |
      v
Argo reconciliation
```

## What should the PR change?

Our development Kustomization currently contains:

```yaml
images:
  - name: example/web
    newName: nginx
    newTag: 1.27-alpine
```

A real promotion should result in something like:

```yaml
images:
  - name: example/web
    newName: ghcr.io/example/web-app
    digest: sha256:0123456789abcdef...
```

That diff is boring.

Boring is good.

The deployment decision becomes obvious in code review.

## Authentication for the GitOps repository

The build repository needs permission to open a PR in the GitOps repository.

For a lab, you can use a fine-grained token stored as:

```text
GITOPS_TOKEN
```

Give it only the target GitOps repository permissions it needs for:

```text
contents: write
pull requests: write
```

For a serious platform, prefer a GitHub App or equivalent workload identity over a developer's personal token.

The identity should represent:

```text
promotion automation
```

not:

```text
Alice's laptop credential
```

## Promotion job

Add this after the image build/sign steps:

```yaml
      - name: Propose development promotion
        env:
          GH_TOKEN: ${{ secrets.GITOPS_TOKEN }}
          GITOPS_REPOSITORY: YOUR_USER/platform-gitops
          IMAGE: ghcr.io/${{ github.repository }}
          DIGEST: ${{ steps.build.outputs.digest }}
          SOURCE_SHA: ${{ github.sha }}
        run: |
          set -euo pipefail

          gh auth setup-git
          gh repo clone "$GITOPS_REPOSITORY" gitops
          cd gitops

          branch="promote/web-${SOURCE_SHA:0:12}"
          git checkout -b "$branch"

          python3 - "$IMAGE" "$DIGEST" <<'PY'
          from pathlib import Path
          import sys

          image = sys.argv[1]
          digest = sys.argv[2]
          p = Path("environments/dev/web/kustomization.yaml")
          text = p.read_text()

          start = text.index("images:\n")
          replacement = f"""images:\n  - name: example/web\n    newName: {image}\n    digest: {digest}\n"""
          text = text[:start] + replacement
          p.write_text(text)
          PY

          git config user.name "web promotion bot"
          git config user.email "web-promotion-bot@users.noreply.github.com"

          git add environments/dev/web/kustomization.yaml
          git commit -m "promote web ${SOURCE_SHA:0:12} to dev"
          git push --set-upstream origin "$branch"

          gh pr create \
            --repo "$GITOPS_REPOSITORY" \
            --base main \
            --head "$branch" \
            --title "Promote web ${SOURCE_SHA:0:12} to dev" \
            --body "Image: ${IMAGE}@${DIGEST}

Source commit: ${SOURCE_SHA}"
```

Replace:

```text
YOUR_USER/platform-gitops
```

with your GitOps repository.

After your next application merge, CI should build an image and open a GitOps PR.

That PR is the deployment proposal.
