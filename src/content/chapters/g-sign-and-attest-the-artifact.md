A digest answers:

> Which bytes?

A signature or provenance attestation helps answer:

> Who or what produced these bytes, and under what build identity?

For GitHub CI, Sigstore/Cosign can use GitHub's OIDC identity so the workflow does not need a long-lived signing key.

Add Cosign:

```yaml
      - name: Install Cosign
        uses: sigstore/cosign-installer@v4

      - name: Sign image
        env:
          IMAGE: ghcr.io/${{ github.repository }}
          DIGEST: ${{ steps.build.outputs.digest }}
        run: |
          cosign sign --yes "${IMAGE}@${DIGEST}"
```

The workflow needs:

```yaml
permissions:
  id-token: write
```

which we already granted.

GitHub also supports artifact provenance attestations using the image digest output.

The exact product choice is less important than the model:

```text
source identity
      |
      v
build system identity
      |
      v
artifact digest
      |
      v
signature / provenance
```

## Verify locally

Install Cosign if needed:

```bash
brew install cosign
```

Then verification takes the general form:

```bash
cosign verify \
  ghcr.io/YOUR_USER/web-app@sha256:... \
  --certificate-identity-regexp='^https://github.com/' \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com
```

For production, make the expected certificate identity specific to the repository and workflow rather than using a broad regular expression.

## Harbor

Harbor can store Cosign signatures as OCI-related artifacts associated with the signed image.

It can also enforce project content-trust policies so unsigned artifacts cannot be pulled.

That makes the chain stronger:

```text
CI signs image
      |
      v
Harbor stores image + signature
      |
      v
Harbor policy rejects unsigned pull
```

Signing without verification is documentation.

Signing plus enforcement is a security control.
