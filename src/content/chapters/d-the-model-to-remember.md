For networking:

```text
Application intent
      |
      v
Kubernetes API
      |
      v
Controller / network implementation
      |
      v
Envoy / eBPF / Linux
      |
      v
actual traffic
```

For debugging:

```text
API status
   |
   v
references
   |
   v
Services / endpoints
   |
   v
implementation status
   |
   v
observed flows
   |
   v
dataplane
```

Do not jump straight to the bottom.

Prove each layer.
