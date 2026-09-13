Production images may intentionally not contain:

```text
bash
curl
dig
tcpdump
ps
```

That is often desirable.

A production image does not need a complete incident-response toolbox merely to make debugging convenient.

When `kubectl exec` is insufficient, Kubernetes can add an ephemeral debugging container to an existing Pod.

Pick one API Pod:

```bash
POD=$(kubectl get pod -l app=api \
  -o jsonpath='{.items[0].metadata.name}')
```

Start a debug container:

```bash
kubectl debug -it "$POD" \
  --image=busybox:1.36 \
  --target=nginx
```

This gives you debugging utilities without permanently changing the production application image.

Depending on runtime and security configuration, process visibility and debugging capabilities can differ.

The conceptual point is:

```text
production container stays minimal
        +
temporary debug tooling when needed
```

rather than:

```text
ship every debugging utility in every production image forever
```
