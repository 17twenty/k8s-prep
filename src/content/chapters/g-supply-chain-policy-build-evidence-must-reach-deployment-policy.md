We built and signed an artifact.

That is only half the story.

A mature platform connects build evidence to deployment policy.

For example:

```text
CI produces:
  image digest
  signature
  provenance
  SBOM
  vulnerability result

promotion policy requires:
  trusted builder identity
  no forbidden vulnerabilities
  approved source repository
  immutable digest

admission policy verifies:
  image is allowed to start
```

This closes a gap that Git review alone cannot.

A perfectly reviewed Git commit could still point to:

```text
unsigned malicious image
```

if nothing verifies the artifact.

Likewise, a perfectly signed artifact can still be accidentally promoted to the wrong environment if Git permissions are too broad.

The controls reinforce one another.
