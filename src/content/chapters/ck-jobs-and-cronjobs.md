A Deployment represents work that should keep running.

Some work should **finish**.

That is the problem a Job solves.

## Job: run finite work to completion

Create:

```bash
kubectl create job hello \
  --image=busybox:1.36 \
  -- echo hello-from-job
```

Inspect:

```bash
kubectl get jobs
kubectl get pods -l job-name=hello
```

Logs:

```bash
kubectl logs job/hello
```

Completion status:

```bash
kubectl get job hello \
  -o jsonpath='{.status.succeeded}{"\n"}'
```

Ownership:

```bash
kubectl get pods \
  -l job-name=hello \
  -o custom-columns='POD:.metadata.name,OWNER:.metadata.ownerReferences[0].name'
```

A Job controller is still reconciling desired state.

Its desired state is just different:

```text
Deployment -> keep N replicas running
Job        -> achieve N successful completions
```

Cleanup:

```bash
kubectl delete job hello
```

## CronJob: create Jobs on a schedule

Create:

```bash
kubectl create cronjob clock \
  --image=busybox:1.36 \
  --schedule='*/2 * * * *' \
  -- date
```

Inspect:

```bash
kubectl get cronjobs
```

Rather than waiting, manually create a Job from its template:

```bash
kubectl create job \
  --from=cronjob/clock \
  clock-now
```

Follow the ownership model:

```text
CronJob
   |
   v
Job
   |
   v
Pod
```

Logs:

```bash
kubectl logs job/clock-now
```

Useful CronJob controls include:

```text
schedule
suspend
concurrencyPolicy
startingDeadlineSeconds
successfulJobsHistoryLimit
failedJobsHistoryLimit
```

Discover them rather than guessing:

```bash
kubectl explain cronjob.spec
```

Cleanup:

```bash
kubectl delete cronjob clock
kubectl delete job clock-now
```
