Run this on the control plane.

```bash
CILIUM_CLI_VERSION="$(
  curl -s \
  https://raw.githubusercontent.com/cilium/cilium-cli/main/stable.txt
)"

CLI_ARCH=amd64

if [ "$(uname -m)" = "aarch64" ]; then
  CLI_ARCH=arm64
fi
```

Download:

```bash
curl -L --fail --remote-name-all \
  "https://github.com/cilium/cilium-cli/releases/download/${CILIUM_CLI_VERSION}/cilium-linux-${CLI_ARCH}.tar.gz"{,.sha256sum}
```

Verify:

```bash
sha256sum --check \
  "cilium-linux-${CLI_ARCH}.tar.gz.sha256sum"
```

Install:

```bash
sudo tar xzvfC \
  "cilium-linux-${CLI_ARCH}.tar.gz" \
  /usr/local/bin
```

Cleanup:

```bash
rm "cilium-linux-${CLI_ARCH}.tar.gz"{,.sha256sum}
```

Check:

```bash
cilium version
```
