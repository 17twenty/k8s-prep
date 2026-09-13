A hands-on companion to the Kubernetes cookbook.

The Kubernetes cookbook teaches you how Kubernetes reconciles desired state into running workloads.

This handbook takes the next step:

> How does application code safely become desired state in a real cluster?

The goal is not to memorise Argo CD commands.

The goal is to understand a modern delivery system well enough that you can reason about it, debug it, secure it, and eventually build a platform around it.

We will build this path:

```text
developer
   |
   | git push / pull request
   v
application repository
   |
   | CI tests, builds, scans
   v
OCI registry
   |
   | immutable image + digest
   v
promotion pull request
   |
   v
GitOps repository
   |
   | reviewed desired-state change
   v
Argo CD
   |
   | reconciliation
   v
Kubernetes API
   |
   v
Argo Rollouts
   |
   | canary / blue-green / analysis / promotion
   v
running application
```

By the end, we will have replaced the classic pipeline:

```text
CI job
  |
  | kubectl apply
  | cluster-admin kubeconfig
  v
production
```

with:

```text
CI
 |
 +-- builds an artifact
 +-- signs / attests it
 +-- proposes a desired-state change
 |
 v
Git pull request
 |
 | human / policy review
 v
Git
 |
 | pulled by controller
 v
cluster
```

Sections are marked:

- **[DEV]** - application developer knowledge
- **[OPS]** - operating delivery systems
- **[PLATFORM]** - platform engineering and multi-team design
- **[DEEP DIVE]** - concepts worth understanding beyond the immediate lab

The recurring teaching loop is the same as the main Kubernetes cookbook:

```text
problem
  |
  v
mental model
  |
  v
small experiment
  |
  v
observe the controllers
  |
  v
change one thing
  |
  v
observe the consequence
  |
  v
break an assumption
  |
  v
explain why
```
