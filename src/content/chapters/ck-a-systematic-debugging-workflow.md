Random commands make Kubernetes feel mysterious.

Most failures become easier when you follow the relationship between objects.

## Workload failure

Follow ownership downward:

```text
Deployment
    |
    v
ReplicaSet
    |
    v
Pod
    |
    v
Container
    |
    v
Process
```

Commands:

```bash
kubectl get deployment api
kubectl get rs -l app=api
kubectl get pods -l app=api
kubectl describe pod <pod>
kubectl logs <pod>
```

Previous crashed container instance:

```bash
kubectl logs <pod> --previous
```

Events:

```bash
kubectl get events \
  --sort-by=.metadata.creationTimestamp
```

Questions to ask in order:

```text
Did the controller create the expected child resource?
Did the Pod schedule?
Did the image pull?
Did the container start?
Did the process stay alive?
Did readiness succeed?
```

## Networking failure

Follow the request path:

```text
DNS
 |
 v
Service
 |
 v
selector
 |
 v
EndpointSlice
 |
 v
ready Pod
 |
 v
container port
 |
 v
process
```

Useful commands:

```bash
kubectl exec client -- nslookup api
kubectl get service api -o yaml
kubectl get pods -l app=api --show-labels
kubectl get endpointslices \
  -l kubernetes.io/service-name=api
kubectl describe pod <pod>
```

Then test the application directly from inside the cluster when possible.

## Configuration failure

Follow references:

```text
Pod spec
  |
  +-- ConfigMap name/key
  |
  +-- Secret name/key
  |
  +-- volume name
  |
  +-- mount path
```

Useful commands:

```bash
kubectl describe pod <pod>
kubectl get configmap <name> -o yaml
kubectl get secret <name> -o yaml
```

A misspelled Secret key can prevent a container from starting even though the Secret object itself exists.

## Authorization failure

Ask Kubernetes instead of guessing:

```bash
kubectl auth can-i get pods
kubectl auth can-i create deployments
```

For another identity, when impersonation is permitted:

```bash
kubectl auth can-i list pods \
  --as=system:serviceaccount:cookbook:api-sa
```

The general debugging habit is:

> Follow the API relationships until you find the first place where observed state stops matching your expectation.
