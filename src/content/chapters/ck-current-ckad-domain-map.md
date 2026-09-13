This cookbook is intentionally organised for understanding rather than mirroring the exam outline chapter-for-chapter.

The current CKAD domains map roughly as follows:

## Application Design and Build - 20%

Covered by:

- container image definitions and builds
- Pods and container command/args
- workload selection
- multi-container Pods
- init containers and sidecars
- Jobs and CronJobs
- ephemeral and persistent volumes
- StatefulSets and DaemonSets

## Application Deployment - 20%

Covered by:

- Deployments and ReplicaSets
- scaling
- rolling updates and rollback
- blue-green and canary strategies
- Helm
- Kustomize

## Application Observability and Maintenance - 15%

Covered by:

- `get`, `describe`, logs and events
- readiness, liveness and startup probes
- rollout state
- API deprecation and discovery
- systematic debugging
- ephemeral debug containers

## Application Environment, Configuration and Security - 25%

Covered by:

- requests and limits
- quotas and limits policy concepts
- ConfigMaps and Secrets
- Downward API
- ServiceAccounts
- RBAC and authorization
- admission concepts
- SecurityContext and capabilities
- CRDs and Operators

## Services and Networking - 20%

Covered by:

- Services
- labels and selectors
- EndpointSlices
- DNS
- network troubleshooting
- NetworkPolicy
- Ingress

Supplemental deep dive:

- Gateway API concepts and hands-on Cilium Gateway API in `cillium-gateay-appendix.md`
