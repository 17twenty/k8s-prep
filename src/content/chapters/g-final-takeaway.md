Bad CI/CD often gives one automation system enormous authority:

```text
source
  |
  v
CI
  |
  | build
  | mutate production
  | own cluster credentials
  v
cluster
```

A better delivery platform separates concerns:

```text
source
  |
  v
CI
  |
  | produces immutable evidence
  v
artifact
  |
  v
promotion PR
  |
  | changes reviewed desired state
  v
Git
  |
  v
Argo CD
  |
  | reconciles cluster intent
  v
Argo Rollouts
  |
  | controls exposure
  v
runtime
```

At each boundary we can ask:

```text
What is the desired state?
Who may change it?
Which controller reconciles it?
What identity does that controller use?
How do we observe failure?
How do we return to a known-good state?
```

If you can answer those questions, you are no longer merely deploying to Kubernetes.

You are designing a platform.
