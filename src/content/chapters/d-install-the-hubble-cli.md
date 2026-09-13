On Linux:

```bash
HUBBLE_VERSION="$(
  curl -s \
  https://raw.githubusercontent.com/cilium/hubble/main/stable.txt
)"

HUBBLE_ARCH=amd64

if [ "$(uname -m)" = "aarch64" ]; then
  HUBBLE_ARCH=arm64
fi
```

Download:

```bash
curl -L --fail --remote-name-all \
  "https://github.com/cilium/hubble/releases/download/${HUBBLE_VERSION}/hubble-linux-${HUBBLE_ARCH}.tar.gz"{,.sha256sum}
```

Verify:

```bash
sha256sum --check \
  "hubble-linux-${HUBBLE_ARCH}.tar.gz.sha256sum"
```

Install:

```bash
sudo tar xzvfC \
  "hubble-linux-${HUBBLE_ARCH}.tar.gz" \
  /usr/local/bin
```

Cleanup:

```bash
rm "hubble-linux-${HUBBLE_ARCH}.tar.gz"{,.sha256sum}
```

Check:

```bash
hubble version
```

Validate Relay:

```bash
hubble status -P
```

`-P` tells the CLI to set up the required local port-forward automatically.
