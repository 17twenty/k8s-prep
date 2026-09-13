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

Let's hit that problem before solving it.

## First try ordinary `exec`

Pick one API Pod:

```bash
POD=$(kubectl get pod -l app=api \
  -o jsonpath='{.items[0].metadata.name}')

CONTAINER=$(kubectl get pod "$POD" \
  -o jsonpath='{.spec.containers[0].name}')

printf 'pod=%s container=%s\n' "$POD" "$CONTAINER"
```

Try to use `curl` inside the application container:

```bash
kubectl exec "$POD" -c "$CONTAINER" -- \
  curl -s http://127.0.0.1
```

Our nginx-based image does not normally contain `curl`, so the command should fail with an executable-not-found error.

That is not necessarily an image defect.

It can be a deliberate production-image choice.

## Add temporary tooling instead

Attach an ephemeral debugging container:

```bash
kubectl debug -it "$POD" \
  --image=busybox:1.36 \
  --target="$CONTAINER" \
  -- sh
```

Inside the debug container, call the application over the Pod's shared network namespace:

```sh
wget -qO- http://127.0.0.1
```

You can also inspect processes:

```sh
ps
```

Then exit:

```sh
exit
```

Inspect what Kubernetes added:

```bash
kubectl get pod "$POD" \
  -o jsonpath='{range .spec.ephemeralContainers[*]}{.name}{" image="}{.image}{" target="}{.targetContainerName}{"\n"}{end}'
```

The original application image did not change.

The Pod now has temporary debugging tooling attached to it.

Conceptually:

```text
minimal production container
        |
        | exec lacks tooling
        v
   debugging blocked
        |
        | kubectl debug
        v
ephemeral container joins Pod
        |
        +-- same Pod network
        +-- optional process targeting
        +-- extra tools
```

Ephemeral containers are intentionally different from normal application containers:

- they are added to an existing Pod for troubleshooting
- they are not part of the normal workload template
- they do not restart like ordinary workload containers
- they cannot define normal container resources such as ports or probes

Depending on the runtime and security configuration, process visibility and debugging capabilities can differ.

The model to keep is:

```text
production container stays minimal
        +
temporary debug tooling when needed
```

rather than:

```text
ship every debugging utility in every production image forever
```
