A runnable Kubernetes cookbook for application developers and CKAD candidates.

The goal is not to memorise YAML, we're going to build a mental model of Kubernetes, use the API deliberately, observe what the control plane did, break things on purpose, and work out why they broke.

**Target:** Kubernetes 1.35 and the current CKAD curriculum.

Sections are marked:

- **[CKAD]** - directly relevant to CKAD
- **[DEV]** - practical application developer knowledge
- **[DEEP DIVE]** - controllers, operators and platform engineering

This cookbook is intentionally cumulative. We will keep reusing the same resources so that later concepts explain earlier behaviour rather than appearing as unrelated YAML fragments.

The recurring teaching loop is:

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
observe Kubernetes
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

When a section does not need every step, we will not force it into a template.
