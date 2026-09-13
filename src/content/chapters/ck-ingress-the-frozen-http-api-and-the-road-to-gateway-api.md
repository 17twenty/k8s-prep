A ClusterIP Service gives an application a stable endpoint inside the cluster.

Users outside the cluster often need HTTP routing to that Service.

Historically, Kubernetes modelled that with `Ingress`.

An important distinction is:

> An Ingress object is configuration. An Ingress controller is the software that implements it.

That distinction is worth observing directly.

## Check whether anything implements Ingress

Ask the cluster for its available implementations:

```bash
kubectl get ingressclass
```

A stock kind cluster may return no classes at all.

That means the API server understands `Ingress`, but nothing is currently responsible for turning those objects into working HTTP listeners.

This is the same pattern we will later see with CRDs and controllers:

```text
API object exists
      |
      v
controller watches it
      |
      v
real behaviour appears
```

No controller means the middle step is missing.

## Create the API object anyway

Save as `ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
spec:
  rules:
    - host: api.cookbook.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
```

Apply:

```bash
kubectl apply -f ingress.yaml
```

Inspect:

```bash
kubectl get ingress api
kubectl describe ingress api
```

Inspect status directly:

```bash
kubectl get ingress api \
  -o jsonpath='{.status.loadBalancer.ingress}{"\n"}'
```

If there is no controller, that status will normally remain empty and no HTTP listener will magically appear.

That is useful behaviour to understand:

```text
Ingress stored in API       yes
routing implementation      no
external traffic path       no
```

If your cluster already has a maintained Ingress controller, set the matching class:

```yaml
spec:
  ingressClassName: <class-name>
```

and follow that controller's documented exposure method.

The abstract path is still:

```text
HTTP request
   |
   v
Ingress controller
   |
   | host/path rule
   v
Service
   |
   v
ready backend Pods
```

Ingress does not replace a Service.

It routes to one.

## Why we do not install an Ingress controller just for this lab

The Kubernetes project now recommends **Gateway API** instead of Ingress.

Ingress remains a stable API and is not being removed, but the API is frozen and no longer gaining features.

Also avoid old tutorials that tell you to install `ingress-nginx`: that project was retired in March 2026 and no longer receives fixes or security updates.

So the main cookbook keeps Ingress because it is still important Kubernetes and CKAD knowledge, but we do not introduce a legacy controller merely to make this one exercise route traffic.

Instead, the networking deep dive takes the modern path.

Continue with `cillium-gateay-appendix.md`, where we actually install and exercise Cilium's Gateway API implementation:

```text
GatewayClass
     |
     v
Gateway
     |
     v
HTTPRoute
     |
     v
Service
     |
     v
Pod
```

That appendix sends real traffic, breaks backend references, inspects status, exercises header routing, weighted backends, cross-namespace `ReferenceGrant`, and follows the implementation down through Envoy, Cilium and eBPF.

The important progression is:

```text
Ingress
  -> simple, stable, frozen HTTP routing API

Gateway API
  -> role-oriented, extensible service-networking APIs
```

For a broader tour of the Gateway API resource model and its routing features, Roman Glushko's deep dive is also excellent:

https://www.romaglushko.com/blog/k8s-gateway-api/

Cleanup:

```bash
kubectl delete ingress api
rm -f ingress.yaml
```
