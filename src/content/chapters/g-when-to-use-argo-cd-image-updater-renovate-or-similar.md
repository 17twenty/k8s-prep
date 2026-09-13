In this handbook, application CI opens the promotion PR itself.

That is not the only valid automation model.

Another controller or bot can watch registries and propose Git changes.

Examples include:

```text
Argo CD Image Updater
Renovate
Flux image automation
custom release automation
```

The important requirement is not which bot edits Git.

The requirement is that the final desired-state decision remains explicit and auditable.

A useful distinction is:

```text
DISCOVERY
"a new artifact exists"

PROMOTION
"this environment should now run it"
```

Do not accidentally turn discovery into uncontrolled production promotion unless that is explicitly the policy you want.

For example:

```text
automatically discover every new dev image
    -> probably fine

automatically deploy every new image to prod
    -> much stronger decision
```
