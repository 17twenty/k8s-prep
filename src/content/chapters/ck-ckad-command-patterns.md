Understanding matters first.

Once the mental model is solid, speed comes from having a small number of productive command patterns in muscle memory.

## Context and namespace

```bash
kubectl config get-contexts
kubectl config current-context
kubectl config set-context --current --namespace=cookbook
```

## Discovery

```bash
kubectl api-resources
kubectl api-versions
kubectl explain pod
kubectl explain deployment.spec.template.spec.containers
```

## Pods

Create:

```bash
kubectl run test \
  --image=busybox:1.36 \
  --restart=Never \
  --command -- sleep 3600
```

Generate YAML:

```bash
kubectl run test \
  --image=busybox:1.36 \
  --restart=Never \
  --dry-run=client \
  -o yaml
```

Logs and exec:

```bash
kubectl logs test
kubectl logs test --previous
kubectl exec -it test -- sh
```

## Deployments

Create:

```bash
kubectl create deployment api \
  --image=nginx:1.27-alpine \
  --replicas=3
```

Generate YAML:

```bash
kubectl create deployment api \
  --image=nginx:1.27-alpine \
  --replicas=3 \
  --dry-run=client \
  -o yaml
```

Scale:

```bash
kubectl scale deployment api --replicas=5
```

Image:

```bash
kubectl set image deployment/api \
  nginx=nginx:1.28-alpine
```

Rollouts:

```bash
kubectl rollout status deployment/api
kubectl rollout history deployment/api
kubectl rollout undo deployment/api
```

## Services

Expose a Deployment:

```bash
kubectl expose deployment api \
  --port=80 \
  --target-port=80
```

Generate Service YAML without creating:

```bash
kubectl expose deployment api \
  --port=80 \
  --target-port=80 \
  --dry-run=client \
  -o yaml
```

Endpoints:

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=api
```

## ConfigMaps and Secrets

```bash
kubectl create configmap app-config \
  --from-literal=MODE=dev

kubectl create secret generic app-secret \
  --from-literal=password=example
```

Generate instead of create:

```bash
kubectl create configmap app-config \
  --from-literal=MODE=dev \
  --dry-run=client \
  -o yaml

kubectl create secret generic app-secret \
  --from-literal=password=example \
  --dry-run=client \
  -o yaml
```

## Jobs and CronJobs

```bash
kubectl create job hello \
  --image=busybox:1.36 \
  -- echo hello

kubectl create cronjob clock \
  --image=busybox:1.36 \
  --schedule='*/5 * * * *' \
  -- date
```

Generate YAML by adding:

```text
--dry-run=client -o yaml
```

## Editing and patching

```bash
kubectl edit deployment api
```

Merge patch:

```bash
kubectl patch deployment api \
  --type=merge \
  -p '{"spec":{"replicas":2}}'
```

Strategic merge is useful for Kubernetes built-in list structures such as named containers:

```bash
kubectl patch deployment api \
  --type=strategic \
  -p 'spec:
        template:
          spec:
            containers:
              - name: nginx
                image: nginx:1.28-alpine'
```

## Output

YAML:

```bash
kubectl get pod test -o yaml
```

JSONPath:

```bash
kubectl get pod test \
  -o jsonpath='{.status.podIP}{"\n"}'
```

Custom columns:

```bash
kubectl get pods \
  -o custom-columns='NAME:.metadata.name,NODE:.spec.nodeName,IP:.status.podIP'
```

Sort:

```bash
kubectl get pods \
  --sort-by=.metadata.creationTimestamp
```

Labels:

```bash
kubectl get pods --show-labels
kubectl get pods -l app=api
```

## Waiting

```bash
kubectl wait \
  --for=condition=Ready \
  pod/test \
  --timeout=60s
```

Deployment rollout:

```bash
kubectl rollout status deployment/api --timeout=60s
```

## Debugging

```bash
kubectl get pods
kubectl describe pod <pod>
kubectl logs <pod>
kubectl logs <pod> --previous
kubectl get events --sort-by=.metadata.creationTimestamp
```

Network path:

```bash
kubectl get svc
kubectl get pods --show-labels
kubectl get endpointslices
kubectl exec <client> -- nslookup <service>
```

Authorization:

```bash
kubectl auth can-i get pods
```

## Temporary testing Pods

DNS/network shell:

```bash
kubectl run tmp \
  --image=busybox:1.36 \
  --restart=Never \
  -it --rm -- sh
```

If the exam environment has a different preferred utility image, use whatever image is already available and appropriate to the task.

## Useful shell habit

For commands you will repeat, capture names rather than retyping hashes:

```bash
POD=$(kubectl get pod -l app=api \
  -o jsonpath='{.items[0].metadata.name}')

echo "$POD"
```

The goal is not command golf.

The goal is to spend exam time solving the Kubernetes problem rather than manually reconstructing YAML you could have generated.
