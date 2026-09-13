When designing a platform, ask these questions in order.

```text
1. Are the tenants mutually trusted?
        |
        +-- yes -> shared cluster + namespace/RBAC may be sufficient
        |
        +-- no  -> continue

2. Do tenants need broad Kubernetes administration?
        |
        +-- yes -> consider separate tenant API/control-plane boundaries

3. Can tenants execute arbitrary workloads?
        |
        +-- yes -> decide what worker/kernel isolation is required

4. Can workloads communicate across tenants?
        |
        +-- no -> enforce network boundaries

5. Can storage or devices be shared safely?
        |
        +-- design CSI/device/IOMMU/etc. boundaries accordingly

6. Can tenant credentials reach the provider management plane?
        |
        +-- they generally should not
```

Then pick technology.

Do not begin with:

```text
"We should use vCluster."
```

Begin with:

```text
"What boundary are we trying to create?"
```
