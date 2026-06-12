# EZ2GM Deployment Guide

## Current GitHub Repository

Repository:

```text
https://github.com/ducthuy20041977-jpg/ez2gm.git
```

This workspace does not have `git` installed, so upload the project through GitHub Desktop, Git Bash, or the GitHub web UI. Do not upload `node_modules` or `.env` files.

## Domain Layout

```text
ez2gm.com       -> Cloudflare Pages frontend/admin
www.ez2gm.com   -> redirect to ez2gm.com
api.ez2gm.com   -> backend API
img.ez2gm.com   -> Cloudflare R2 public images
```

## Files To Upload

Upload the full project folder, but exclude:

```text
node_modules/
.env
*.log
outputs/ez2gm-admin/preview*.png
```

The `.gitignore` already covers these.

## Deploy Backend On Render

1. Open Render.
2. New + -> Blueprint.
3. Connect the GitHub repo.
4. Render will read `render.yaml`.
5. Fill secret environment variables:

```text
DATABASE_URL=<Neon connection string>
SESSION_SECRET=<long random string>
ENCRYPTION_KEY=<long random string>
R2_ACCESS_KEY_ID=<Cloudflare R2 key id>
R2_SECRET_ACCESS_KEY=<Cloudflare R2 secret>
```

6. After deploy, open:

```text
https://<render-service-url>/api/health
```

7. Add custom domain in Render:

```text
api.ez2gm.com
```

8. Add the DNS record Render gives you in Cloudflare.

## Deploy Frontend On Cloudflare Pages

1. Cloudflare -> Workers & Pages -> Create application -> Pages.
2. Connect the GitHub repo.
3. Build settings:

```text
Build command: empty
Build output directory: outputs/ez2gm-admin
Root directory: empty
```

4. Add custom domains:

```text
ez2gm.com
www.ez2gm.com
```

`_redirects` redirects `www.ez2gm.com` to `ez2gm.com`.

## R2 Public Images

R2 bucket:

```text
ez2gm
```

Custom domain:

```text
img.ez2gm.com
```

Run CORS once from backend if needed:

```powershell
cd outputs\ez2gm-admin\backend
$env:R2_ENDPOINT="https://d643ff49897302d31734dbc69c5895f2.r2.cloudflarestorage.com"
$env:R2_BUCKET="ez2gm"
$env:R2_ACCESS_KEY_ID="<key>"
$env:R2_SECRET_ACCESS_KEY="<secret>"
npm.cmd run r2:cors
```

## Final Checks

```text
https://api.ez2gm.com/api/health
https://ez2gm.com
https://img.ez2gm.com/<known-test-file>
```

Login accounts:

```text
owner@ez
admin01
service01
supplier-a
```
