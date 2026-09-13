A ClusterIP Service gives an application a stable endpoint inside the cluster.

Users outside the cluster often need HTTP routing to that Service.

Ingress describes HTTP and HTTPS routing rules.

An important distinction:

> An Ingress object is configuration. An Ingress controller is the software that implements it.

## Check whether the cluster has an IngressClass

```bash
kubectl get ingressclass
```

If there is no Ingress controller, you can still study and create the API object, but traffic will not be routed.

## Create an Ingress rule

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

If your cluster requires a particular class, add:

```yaml
spec:
  ingressClassName: <class-name>
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

The routing model is:

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

Notice how Ingress does not replace a Service.

It usually routes **to** one.

Cleanup:

```bash
kubectl delete ingress api
rm -f ingress.yaml
```
