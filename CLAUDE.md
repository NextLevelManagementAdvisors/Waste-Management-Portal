# Waste Management Portal — Claude Instructions

## Project Overview
Rural Waste Management platform with 3 independent portals:
- **Customer portal** — `/` — service management, billing, chat
- **Admin portal** — `/admin/` — operations, scheduling, customer mgmt
- **Team/Driver portal** — `/team/` — route execution, onboarding

Platform brand: **Rural Waste Management** (domain: app.ruralwm.com)

## Architecture
- **Multi-SPA Vite build** — 3 separate SPAs, single Express backend
- Built output: `dist/` (customer), `dist/admin/`, `dist/team/`
- **Backend**: Express 5 + PostgreSQL, all served from one process on port 5000
- **Sessions**: PostgreSQL store via `connect-pg-simple`, table: `session`
- Session keys: `req.session.userId` (customer/admin), `req.session.driverId` (driver)

## Tech Stack
| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS 4 |
| Build | Vite 6 (multi-SPA config in `vite.config.ts`) |
| Backend | Express 5, TypeScript, `tsx` runtime |
| Database | PostgreSQL 14+ |
| Testing | Vitest |
| Payments | Stripe (subscriptions, Connect, webhooks) |
| Email | Gmail API (`server/gmailClient.ts`) |
| SMS | Twilio (`server/twilioClient.ts`) |
| Routing | OptimoRoute (`server/optimoRouteClient.ts`) |
| Auth | express-session + bcrypt + Google OAuth |
| Real-time | WebSocket (`server/websocket.ts`) |

## Running the App

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
NODE_ENV=production npx tsx --env-file=.env server/index.ts
```
Always kill port 5000 first: `npx kill-port 5000`

### Tests
```bash
npx vitest run          # run all tests once
npx vitest              # watch mode
```

## Code Conventions

### File Naming
- React components: `PascalCase.tsx`
- Backend routes: `*Routes.ts` (e.g., `adminRoutes.ts`, `teamRoutes.ts`)
- Services/utilities: `camelCase.ts`
- DB columns, env vars, API fields: `snake_case`
- Constants: `UPPER_SNAKE_CASE`

### Structure Rules
- **All DB queries live in `server/storage.ts`** — never write raw SQL in route files
- Backend routes go in `server/*Routes.ts`, registered in `server/index.ts`
- Shared UI primitives: `admin/components/ui/`
- Tests: `server/__tests__/*.test.ts` — pattern: `<module>.<feature>.test.ts`

### Frontend
- Functional components with hooks only (no class components)
- Tailwind for all styling — no CSS modules or inline styles
- Path alias `@/*` maps to project root

## Critical Patterns & Gotchas

### Session cookies (IMPORTANT)
Use `cookie.secure: 'auto'` — NOT `secure: true`. The `true` value blocks cookies on HTTP
localhost because express-session won't set `Set-Cookie` unless the request is HTTPS.

### Always call session.save()
With the async PG session store (`saveUninitialized: false`), always call
`req.session.save(callback)` before responding or redirecting after setting session data.
Without it, the session may not persist before the response is sent.
Affects: login, register, Google OAuth callbacks.

### Admin role mapping
`ensureAdmin` creates users with `admin_role = 'superadmin'`, but `ROLE_PERMISSIONS` in
`adminRoutes.ts` only knows `full_admin | support | viewer`. Map `superadmin → full_admin`
in the `requireAdmin` middleware.

### API response safety in React
Always check `r.ok` before using response data. If an endpoint returns non-200, the error
object (truthy) will be set as state and calling `.toFixed()` or similar will crash.

### communicationRoutes.ts auth
Uses DB lookup for admin auth (not `req.session.isAdmin` which is never stored in session).

## Key File Locations
| Purpose | File |
|---|---|
| DB schema | `server/schema.sql` |
| All DB queries | `server/storage.ts` |
| Server entry | `server/index.ts` |
| Admin auth middleware | `server/ensureAdmin.ts` |
| Encryption (ACH data) | `server/encryption.ts` (AES-256-GCM) |
| Stripe webhooks | `server/webhookHandlers.ts` |
| OptimoRoute client | `server/optimoRouteClient.ts` |
| Vite multi-SPA config | `vite.config.ts` |

## Documentation
| File | Contents |
|---|---|
| `docs/USER_STORIES.md` | Feature requirements and user stories for all 3 portals |
| `docs/Optimo_OpenAPI3.0.YAML` | Full OptimoRoute API spec (read before working on routing/scheduling features) |
| `docs/deep-research-report (2).md` | Research notes on platform architecture and integrations |

## Production Deployment
- VPS: Hostinger, `ssh root@178.16.141.166`
- App dir: `/opt/waste-portal`
- Managed by systemd: `waste-portal.service`
```bash
ssh root@178.16.141.166
cd /opt/waste-portal && git pull origin main && npm run build
systemctl restart waste-portal
journalctl -u waste-portal --no-pager -n 15
```

### Hostinger MCP Server
A Hostinger API MCP server is configured in `hostinger.json`. When available, use it for
Hostinger-specific tasks (VPS management, DNS, domains) instead of raw SSH where possible.
- Config file: `~/.claude/hostinger.json` (outside repo, never committed)
- MCP server: `hostinger-api-mcp@latest` (via npx)
- API token is stored in that file — keep it out of the project repo
