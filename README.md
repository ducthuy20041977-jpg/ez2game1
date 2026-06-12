# EZ2GM

EZ2GM operation console and backend API for overseas game services.

## Project Structure

```text
outputs/ez2gm-admin/index.html        Static admin/frontend entry
outputs/ez2gm-admin/assets/           Project images and static assets
outputs/ez2gm-admin/backend/          Node.js backend API
render.yaml                           Render backend deployment blueprint
DEPLOYMENT.md                         Deployment steps
```

## Local Preview

Backend:

```powershell
cd outputs\ez2gm-admin\backend
npm.cmd install
npm.cmd run dev
```

Frontend:

```text
http://localhost:8013/
```

## Production Domains

```text
ez2gm.com       -> frontend/admin
api.ez2gm.com   -> backend API
img.ez2gm.com   -> R2 images
```

See `DEPLOYMENT.md` for the full deployment guide.
