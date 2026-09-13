Make sure the control-plane address is still available:

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

Install Cilium 1.20.1:

```bash
cilium install 1.20.1 \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost="$CONTROL_PLANE_IP" \
  --set k8sServicePort=6443
```

Why do we explicitly tell Cilium where the API server lives?

Normally Pods can reach the API server through the Kubernetes Service.

But:

```text
Kubernetes Service
       |
       v
Service dataplane
```

is exactly what we have not implemented yet.

There is no kube-proxy.

So Cilium needs the real API endpoint while it bootstraps the dataplane that will eventually implement Kubernetes Services.

Watch:

```bash
kubectl get pods \
  -n kube-system \
  -w
```

Eventually you should see Cilium agents and the operator running.

Stop with:

```text
Ctrl-C
```
