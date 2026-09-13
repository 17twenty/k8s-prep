Apply Kamaji's current sample TenantControlPlane:

```bash
kubectl apply -f \
  https://raw.githubusercontent.com/clastix/kamaji/master/config/samples/kamaji_v1alpha1_tenantcontrolplane.yaml
```

Watch it reconcile:

```bash
kubectl get tcp -w
```

Eventually you should see a state similar to:

```text
NAME      VERSION   STATUS   CONTROL-PLANE ENDPOINT   KUBECONFIG
k8s-133   ...       Ready    ...:6443                 k8s-133-admin-kubeconfig
```

Stop the watch with `Ctrl-C`.

Inspect what Kamaji created in the **management cluster**:

```bash
kubectl get tcp,deploy,pods,svc
```

The conceptual chain is:

```text
TenantControlPlane
       |
       v
Kamaji controller
       |
       v
Deployment / Service / certificates / datastore state
       |
       v
running tenant kube-apiserver
       + controller-manager
       + scheduler
```

This is the same `spec -> controller -> status` model we began the entire cookbook with.

Kamaji is simply using it to create Kubernetes control planes.
