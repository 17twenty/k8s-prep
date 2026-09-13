A container image tells Kubernetes **what to run**.

The scheduler also needs to know **what resources it needs**.

That is where requests and limits enter.

A useful first approximation is:

```text
request -> capacity considered when scheduling me
limit   -> runtime ceiling imposed on me
```

CPU and memory behave differently when a limit is exceeded:

- CPU is throttled.
- Memory can result in the container being OOM-killed.

## Create a Pod with resource requirements

Save as `limited.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: limited
spec:
  containers:
    - name: web
      image: nginx:1.27-alpine
      resources:
        requests:
          cpu: 100m
          memory: 64Mi
        limits:
          cpu: 500m
          memory: 128Mi
```

Apply:

```bash
kubectl apply -f limited.yaml
```

Inspect:

```bash
kubectl describe pod limited
```

Or query exactly what you asked for:

```bash
kubectl get pod limited \
  -o jsonpath='{.spec.containers[0].resources}{"\n"}'
```

If Metrics Server exists:

```bash
kubectl top pod limited
```

## Break scheduling on purpose

The scheduler cannot place a Pod whose resource request cannot be satisfied by any eligible node.

Save as `unschedulable.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: unschedulable
spec:
  containers:
    - name: sleeper
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      resources:
        requests:
          memory: 1000Gi
```

Apply:

```bash
kubectl apply -f unschedulable.yaml
```

Observe:

```bash
kubectl get pod unschedulable
```

It should remain `Pending`.

Ask why:

```bash
kubectl describe pod unschedulable
```

Look at the Events section.

The useful debugging lesson is:

```text
Pending Pod
   |
   v
scheduler could not bind it to a node
   |
   v
inspect scheduling events
```

Cleanup:

```bash
kubectl delete pod limited unschedulable
rm -f limited.yaml unschedulable.yaml
```

## ResourceQuota and LimitRange

Requests and limits are workload configuration.

Namespaces can also have policy around resource consumption.

Inspect any existing quota:

```bash
kubectl get resourcequota
kubectl get limitrange
```

A `ResourceQuota` can cap aggregate namespace consumption.

A `LimitRange` can constrain or default per-container or per-Pod values.

You do not need to confuse these with requests and limits:

```text
request / limit -> what this workload asks for
LimitRange      -> policy/defaults around individual workloads
ResourceQuota   -> aggregate namespace budget
```

## Scheduling controls placement, not API permission

Later we will meet node selectors, affinity, taints and tolerations in broader platform contexts.

Keep one distinction in mind now:

```text
scheduler controls
    -> where a Pod is eligible to run

RBAC
    -> what API operations an identity may perform
```

A `NoSchedule` taint on a control-plane node can keep ordinary workloads away from that node. It does **not** decide who may edit Node objects through the API, and it does not control who may SSH into the machine.

We will bring those boundaries together in Chapter 23.
