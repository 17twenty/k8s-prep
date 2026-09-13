Query Gateway conditions:

```bash
kubectl get gateway public \
  -o jsonpath='{range .status.conditions[*]}{.type}={.status}{" reason="}{.reason}{"\n"}{end}'
```

Query HTTPRoute conditions:

```bash
kubectl get httproute api \
  -o jsonpath='{range .status.parents[*].conditions[*]}{.type}={.status}{" reason="}{.reason}{"\n"}{end}'
```

This is the same lesson as:

```text
spec
  -> what I want

status
  -> what the controller observed
```

from the core cookbook.

Gateway API makes the controller relationship particularly visible.
