Generate traffic:

```bash
for i in $(seq 1 5); do
  curl -s \
    -H 'Host: api.example.test' \
    "http://${GATEWAY_NODE_IP}:8080/" >/dev/null
done
```

Observe recent flows:

```bash
hubble observe -P \
  --last 20
```

Observe traffic to the backend namespace:

```bash
hubble observe -P \
  --namespace gateway-lab \
  --last 30
```

You can also filter by Pod:

```bash
hubble observe -P \
  --pod gateway-lab/api-v1 \
  --last 20
```

The debugging model improves from:

```text
"It looks like networking."
```

to:

```text
What flow happened?

From which identity?

To which destination?

Was it forwarded or dropped?

At which layer?
```
