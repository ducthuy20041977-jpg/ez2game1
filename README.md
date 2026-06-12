# EZ2GM

EZ2GM customer storefront, admin console, and Cloudflare Worker API for overseas game services.

## Project Structure

```text
outputs/ez2gm-admin/storefront.html   Customer storefront for ez2gm.com
outputs/ez2gm-admin/index.html        Admin console for admin.ez2gm.com
outputs/ez2gm-admin/_worker.js        Cloudflare Pages hostname router
outputs/ez2gm-admin/assets/           Project images and static assets
api-worker/src/index.js               Cloudflare Worker API
wrangler.toml                         Worker deployment configuration
DEPLOYMENT.md                         Deployment steps
```

## Local Preview

Worker syntax check:

```powershell
npm.cmd install
npm.cmd run worker:check
```

Admin console:

```text
http://localhost:8013/
```

## Production Domains

```text
ez2gm.com         -> customer storefront
admin.ez2gm.com   -> admin console
api.ez2gm.com     -> Cloudflare Worker API
img.ez2gm.com     -> R2 images
```

See `DEPLOYMENT.md` for the full deployment guide.
