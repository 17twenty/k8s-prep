Create a namespace for this lab:

```bash
kubectl create namespace gateway-lab
```

Set it as the current default:

```bash
kubectl config set-context \
  --current \
  --namespace=gateway-lab
```

Create version one:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-v1
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-v1
  template:
    metadata:
      labels:
        app: api-v1
        version: v1
    spec:
      containers:
        - name: web
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              mkdir -p /www
              echo "hello from api-v1" > /www/index.html
              echo "allowed from api-v1" > /www/allowed
              echo "denied from api-v1" > /www/denied
              httpd -f -p 8080 -h /www
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: api-v1
spec:
  selector:
    app: api-v1
  ports:
    - port: 80
      targetPort: 8080
```

Save as:

```text
api-v1.yaml
```

Apply:

```bash
kubectl apply -f api-v1.yaml
```

Create version two:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-v2
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-v2
  template:
    metadata:
      labels:
        app: api-v2
        version: v2
    spec:
      containers:
        - name: web
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              mkdir -p /www
              echo "hello from api-v2" > /www/index.html
              httpd -f -p 8080 -h /www
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: api-v2
spec:
  selector:
    app: api-v2
  ports:
    - port: 80
      targetPort: 8080
```

Save as:

```text
api-v2.yaml
```

Apply:

```bash
kubectl apply -f api-v2.yaml
```

Check:

```bash
kubectl get deployments
kubectl get pods -o wide
kubectl get services
```

Before touching Gateway API, prove ordinary Kubernetes Services work.

Create a client:

```bash
kubectl run client \
  --image=curlimages/curl \
  --restart=Never \
  --command -- \
  sleep 3600
```

Wait:

```bash
kubectl wait \
  --for=condition=Ready \
  pod/client \
  --timeout=90s
```

Test:

```bash
kubectl exec client -- \
  curl -s http://api-v1
```

Expected:

```text
hello from api-v1
```

Then:

```bash
kubectl exec client -- \
  curl -s http://api-v2
```

Expected:

```text
hello from api-v2
```

We have now proved:

```text
Pods
  |
  v
Services
  |
  v
Cilium Service dataplane
```

works before adding L7 routing.
