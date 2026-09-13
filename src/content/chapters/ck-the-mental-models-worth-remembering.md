If you remember nothing else, remember these.

## Kubernetes is a control loop

```text
spec
 |
 v
controller
 |
 v
actual state
 |
 v
status
 |
 +---- observe and reconcile ----+
```

## Controller-managed Pods are replaceable

```text
Deployment
    |
    v
ReplicaSet
    |
    v
Pods
```

Delete a Pod and desired state remains.

The controller creates another.

## A Service is stable because Pods are not

```text
DNS name
  |
  v
Service
  |
  v
EndpointSlices
  |
  v
ready Pods
```

## Labels are relationships, not decoration

```text
selector
  |
  v
matching labels
```

Services, controllers and policies all build behaviour on this idea.

## Readiness and liveness answer different questions

```text
readiness -> should traffic reach me?
liveness  -> should kubelet restart me?
startup   -> have I successfully started yet?
```

## Configuration should not require rebuilding the image

```text
ConfigMap -> non-secret configuration
Secret    -> sensitive configuration API
Downward API -> runtime Kubernetes metadata
```

## Data lifetime is a separate decision from Pod lifetime

```text
emptyDir -> Pod-scoped
PVC      -> persistent storage claim
```

## Debug relationships rather than symptoms

Workload:

```text
Deployment -> ReplicaSet -> Pod -> Container -> Process
```

Network:

```text
DNS -> Service -> selector -> EndpointSlice -> ready Pod -> port -> process
```

Configuration:

```text
Pod spec -> referenced object -> key -> mount/env -> application
```

## Security boundaries answer different questions

```text
authentication
    -> who are you?

authorization / RBAC
    -> may you make this API request?

admission
    -> is this write acceptable?

scheduling controls
    -> where may this workload run?

NetworkPolicy
    -> which network flows are allowed?

infrastructure IAM / SSH
    -> who may administer the actual machines?
```

Namespaces help provide scope, but are not an automatic security boundary by themselves.

For stronger tenancy, separate tenant Kubernetes APIs/control planes can add another boundary; see `multitenancy-appendix.md`.

## Kubernetes extension uses the same model

```text
CRD
  -> teach the API a type

Custom Resource
  -> declare desired state for that type

Controller
  -> reconcile it

Operator
  -> controller + domain-specific operational knowledge
```
