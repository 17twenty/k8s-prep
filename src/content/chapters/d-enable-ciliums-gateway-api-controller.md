A normal Cilium Gateway creates a Service of type:

```text
LoadBalancer
```

On a cloud cluster, the cloud load-balancer integration may give that Service an external address.

Our kubeadm lab deliberately has no cloud load balancer.

Rather than adding another product merely to make the exercise work, we will use Cilium's **Gateway host-network mode**.

That means:

```text
Gateway listener
      |
      v
Cilium Envoy
      |
      v
node network interface
```

Use ports above `1023` for this lab.

Find the API server address:

```bash
export CONTROL_PLANE_IP="$(
  kubectl get node k8s-control \
    -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}'
)"
```

Check:

```bash
echo "$CONTROL_PLANE_IP"
```

Upgrade the existing Cilium installation:

```bash
cilium upgrade 1.20.1 \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost="$CONTROL_PLANE_IP" \
  --set k8sServicePort=6443 \
  --set gatewayAPI.enabled=true \
  --set gatewayAPI.hostNetwork.enabled=true
```

Wait:

```bash
cilium status --wait
```

Inspect Cilium components:

```bash
kubectl get pods \
  -n kube-system \
  -o wide
```

Look for the Cilium agents, operator and Envoy components.
