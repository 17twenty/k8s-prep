So far our GitOps repository deploys public nginx.

Now we will build our own application.

Create a separate repository:

```bash
mkdir -p ~/gitops-lab/web-app
cd ~/gitops-lab/web-app

git init -b main
```

Create a page:

```bash
cat > index.html <<'EOF'
<!doctype html>
<html>
  <body>
    <h1>GitOps demo</h1>
    <p>version: v1</p>
  </body>
</html>
EOF
```

Create the image:

```bash
cat > Dockerfile <<'EOF'
FROM nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/index.html
EOF
```

Build it locally:

```bash
docker build -t web-app:dev .
```

Run it:

```bash
docker run --rm \
  -p 8081:80 \
  web-app:dev
```

From another terminal:

```bash
curl http://127.0.0.1:8081
```

We now have application source that can become an immutable OCI artifact.

Commit it:

```bash
git add .
git commit -m "initial web application"
```

Create and push the hosted repository if you want to follow the CI lab:

```bash
gh repo create web-app \
  --public \
  --source=. \
  --remote=origin \
  --push
```
