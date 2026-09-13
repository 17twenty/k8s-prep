Because we enabled host-network mode, the listener exists on the node network.

Find node addresses:

```bash
kubectl get nodes -o wide
```

Pick one reachable node IP:

```bash
export GATEWAY_NODE_IP="$(
  kubectl get node k8s-worker \
    -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}'
)"
```

If you are using a single-node lab, use `k8s-control` instead.

Check:

```bash
echo "$GATEWAY_NODE_IP"
```

Request:

```bash
curl \
  -H 'Host: api.example.test' \
  "http://${GATEWAY_NODE_IP}:8080/"
```

Expected:

```text
hello from api-v1
```

Try without the hostname:

```bash
curl \
  "http://${GATEWAY_NODE_IP}:8080/"
```

The result should not match our route in the same way.

Why?

Our HTTPRoute declares:

```text
api.example.test
```

Gateway API routing is based on declared listeners and route matches, not merely on a port being open.
