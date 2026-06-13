# EZ2GM Backend Skeleton

This is a low-cost Node.js API for the EZ operation console. It runs in memory for local previews and switches to PostgreSQL when `DATABASE_URL` is configured.

## Run

```powershell
cd outputs\ez2gm-admin\backend
node src/server.js
```

Default API URL: `http://localhost:8020`

If you prefer npm on Windows PowerShell, use `npm.cmd run dev`.

## Domain Plan

Use the root domain `ez2gm.com` when a provider asks for the root/apex domain. Keep API and images on separate subdomains so cache, uploads, and backend permissions do not mix.

```text
ez2gm.com       -> frontend/admin on Cloudflare Pages
www.ez2gm.com   -> optional redirect to ez2gm.com
api.ez2gm.com   -> Node API on Render/Railway/Fly.io
img.ez2gm.com   -> Cloudflare R2 public images
```

Recommended DNS:

```text
@    CNAME/ALIAS  <Cloudflare Pages target>
www  CNAME  <Cloudflare Pages target>
api  CNAME  <backend deployment target>
img  R2 Custom Domain for bucket ez2gm
```

## PostgreSQL / Neon Setup

Keep real secrets in your deployment provider's environment variable panel. Do not put `DATABASE_URL` in frontend code.

```powershell
cd outputs\ez2gm-admin\backend
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require"
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:check
npm.cmd run dev
```

## Cloudflare R2 Uploads

The public upload domain is configured as:

```text
https://img.ez2gm.com
```

For real browser uploads, add these environment variables to the backend deployment:

```powershell
$env:R2_ENDPOINT="https://ACCOUNT_ID.r2.cloudflarestorage.com"
$env:R2_BUCKET="ez2gm"
$env:R2_ACCESS_KEY_ID="..."
$env:R2_SECRET_ACCESS_KEY="..."
$env:R2_PUBLIC_BASE_URL="https://img.ez2gm.com"
```

`POST /api/uploads/sign-url` returns a signed `PUT` URL when R2 keys exist. Without keys, it returns a local fallback URL so the admin preview can keep running.

Use public R2 custom domain only for product images, game project images, and marketing images. Customer screenshots and delivery proofs should stay protected and be shown through authenticated backend views.

Useful commands:

```powershell
npm.cmd run db:migrate  # create or update database tables
npm.cmd run db:seed     # load starter accounts/orders/projects/pricing
npm.cmd run db:check    # verify connection and table counts
npm.cmd run check       # syntax check backend and scripts
```

## Test Login

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8020/api/auth/login -ContentType "application/json" -Body '{"account":"owner@ez","password":"replace-with-admin-password"}'
```

Use the returned token:

```powershell
Invoke-RestMethod -Uri http://localhost:8020/api/orders/EZ2606111008 -Headers @{ Authorization = "Bearer TOKEN" }
```

## Production Notes

- `users`, `orders`, `order_items`, `dispatches`, `chat_threads`, `chat_messages`, `uploads`, `payment_webhooks`, `game_projects`, `pricing_rules`, `price_reviews`, and `audit_logs` use PostgreSQL when `DATABASE_URL` is set.
- Move all secrets to `.env`, never to frontend code.
- Change `SESSION_SECRET` and `ENCRYPTION_KEY` before production.
- Keep `src/middleware/permissions.js` as the role/API guard.

## Added Backend Boundaries

- `src/db/client.js` keeps the PostgreSQL connection boundary separate from route logic.
- `src/lib/security.js` handles password hashing, token digests, and AES-GCM field encryption.
- `GET /api/accounts`, `POST /api/accounts`, and `PATCH /api/accounts/:id` are owner-only account permission APIs.
- Order game IDs and game accounts are returned in clear text for all authenticated order-facing roles; order passwords stay encrypted at rest and are masked for supplier roles.
- `POST /api/uploads/sign-url` creates a short-lived upload URL for order screenshots and project images.
- `GET /api/system/database` shows whether the API is running in memory mode or PostgreSQL-ready mode.
- `GET /api/ai/media-platforms`, `POST /api/ai/media-drafts`, and `POST /api/ai/media-publish` prepare one-click AI promotion publishing.
- `GET /api/analytics/realtime` and `POST /api/analytics/event` support live browsing data and visitor monitoring.
- `GET /api/ai/employees`, `POST /api/ai/tasks/assign`, and `GET /api/analytics/daily` split AI operations into AI employees and daily traffic reports.
- `GET /api/games/projects`, `POST /api/games/projects`, and `POST /api/games/projects/bulk` manage game services including carry, escort, gold, items, boosting, CDK, project images, and customer required fields.
- `GET /api/pricing` and `POST /api/pricing` manage detailed profit rules, cost simulation, payment fees, discounts, supplier costs, and price review queues.

