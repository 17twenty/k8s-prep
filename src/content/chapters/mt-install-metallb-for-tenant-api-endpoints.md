A Kamaji Tenant Control Plane needs an API endpoint.

In this kind lab, the official walkthrough uses MetalLB to provide LoadBalancer addresses on the Docker `kind` network.

Install MetalLB:

```bash
kubectl apply -f \
  https://raw.githubusercontent.com/metallb/metallb/v0.15.3/config/manifests/metallb-native.yaml
```

Wait for its controller:

```bash
kubectl wait \
  --namespace metallb-system \
  --for=condition=Available \
  deployment/controller \
  --timeout=120s
```

Get the IPv4 gateway of the Docker `kind` network:

```bash
GW_IP=$(docker network inspect kind \
  | jq -r '.[0].IPAM.Config[] | select(.Gateway | test("^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$")) | .Gateway')

echo "$GW_IP"
```

Derive the first two octets:

```bash
NET_IP=$(echo "$GW_IP" \
  | sed -E 's|^([0-9]+\.[0-9]+)\..*$|\1|g')

echo "$NET_IP"
```

Create an address pool near the top of that Docker subnet:

```bash
cat <<EOF | sed -E "s|172.19|${NET_IP}|g" | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: kind-ip-pool
  namespace: metallb-system
spec:
  addresses:
    - 172.19.255.200-172.19.255.250
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: kind-l2
  namespace: metallb-system
EOF
```

This is lab networking, not a production LoadBalancer design.
