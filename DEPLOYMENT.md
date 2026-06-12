# EZ2GM Deployment Guide

## Current GitHub Repository

Repository:

```text
https://github.com/ducthuy20041977-jpg/ez2game1.git
```

This workspace does not have `git` installed, so upload the project through GitHub Desktop, Git Bash, or the GitHub web UI. Do not upload `node_modules` or `.env` files.

## Domain Layout

```text
ez2gm.com         -> Cloudflare Pages customer storefront
www.ez2gm.com     -> redirect to ez2gm.com
admin.ez2gm.com   -> Cloudflare Pages admin console
api.ez2gm.com     -> Cloudflare Worker API
img.ez2gm.com     -> Cloudflare R2 public images
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

## Deploy API On Cloudflare Workers

The Worker is configured by `wrangler.toml` and deployed by the project deploy command:

```text
npm run worker:deploy
```

Required Worker secrets:

```text
DATABASE_URL=<Neon connection string>
SESSION_SECRET=<long random string>
ENCRYPTION_KEY=<long random string>
UPLOAD_SIGNING_SECRET=<long random string>
```

Required Worker variables:

```text
APP_NAME=EZ2GM API
PUBLIC_ORIGIN=https://ez2gm.com
R2_PUBLIC_BASE_URL=https://img.ez2gm.com
PASSWORD_ITERATIONS=100000
```

Required Worker binding:

```text
EZ2GM_UPLOADS -> R2 bucket ez2gm
```

After deploy, open:

```text
https://api.ez2gm.com/api/health
```

## Deploy Frontend And Admin On Cloudflare Pages

1. Cloudflare -> Workers & Pages -> Create application -> Pages.
2. Connect the GitHub repo.
3. Build settings:

```text
Build command: npm install
Build output directory: outputs/ez2gm-admin
Root directory: empty
```

4. Deploy command:

```text
npm run worker:deploy
```

5. Add custom domains to the Pages project:

```text
ez2gm.com
www.ez2gm.com
admin.ez2gm.com
```

`_worker.js` sends `ez2gm.com` to the storefront and `admin.ez2gm.com` to the admin console.
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

## Final Checks

```text
https://api.ez2gm.com/api/health
https://ez2gm.com
https://admin.ez2gm.com
https://img.ez2gm.com/<known-test-file>
```

Login accounts:

```text
owner@ez
admin01
service01
supplier-a
```
