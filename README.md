# Waste Management Portal

A full-stack, multi-SPA platform for running a waste management service business. Three separate portals share a single Express backend and PostgreSQL database.

---

## Table of Contents

- [Portals](#portals)
- [Feature Overview](#feature-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Production Deployment](#production-deployment)
  - [Hostinger VPS](#hostinger-vps)
  - [Replit](#replit)
- [Database Schema](#database-schema)
- [Available Scripts](#available-scripts)
- [API Reference](#api-reference)
- [Architecture Notes](#architecture-notes)

---

## Portals

| Portal | URL Path | Audience |
| --- | --- | --- |
| **Client Portal** | `/` | Customers |
| **Admin Portal** | `/admin/` | Operations staff |
| **Team Portal** | `/team/` | 1099 contractor drivers |

All three portals are built as independent React SPAs served from a single Express server. In development, Vite proxies `/api` calls to the Express backend; in production, Express serves the built `dist/` files directly.

---

## Feature Overview

### Client Portal (`/`)

- Email/password registration and login; Google OAuth sign-in
- Personalized dashboard — upcoming pickups, account balance, active services
- Multi-property management with Google Places address autocomplete
- Full Stripe billing: subscriptions, invoices (PDF), payment methods, autopay toggle
- On-demand special pickup requests
- Missed pickup report submission
- Vacation hold scheduling
- Referral program with unique codes and account credits (Stripe customer balance)
- Property and account transfer between users (tokenized email invite)
- Per-property notification preferences (email/SMS for pickup reminders, billing, service updates)
- Message email opt-in: receive an email when a new conversation message arrives
- Password reset via Gmail API
- Floating in-app chat widget (WebSocket, real-time)

### Admin Portal (`/admin/`)

#### Dashboard

- KPI cards (active customers, revenue MTD, subscriptions, missed pickups)
- Signup trend chart, revenue chart, service breakdown chart
- Recent activity feed (signups, pickups, referrals)

#### Customers

- Full customer list with search, filter by service type / Stripe status, CSV export
- Customer detail panel: profile, properties, billing (live Stripe data), communication history, audit activity
- Internal notes and tags per customer
- Bulk actions: email/SMS blast, bulk admin role assignment
- Inline customer editing and Stripe customer linking

#### Billing

- Invoice creation and management (live Stripe)
- Credit application to customer balance
- Subscription start/stop/update
- Payment method overview

#### Operations

- Missed pickup reports with resolution workflow
- Route schedule overview (OptimoRoute-synced)
- Route job management (create, assign, track)

#### Communications

- Real-time WebSocket chat with customers and drivers (1-on-1 or 3-way threads)
- Conversation history persisted in PostgreSQL
- Admin-initiated or customer/driver-initiated threads
- Bulk notification sender (email/SMS to all customers or filtered segment)

#### Drivers

- Driver roster: view onboarding status, availability, ratings
- Admin can sign in as a driver to view their account
- Manage driver status (active/inactive)

#### System

- Audit log: every admin action recorded (who, what, when, on which entity)
- Admin role management: Full Admin, Support, Viewer roles with granular permissions

### Team Portal (`/team/`)

#### Onboarding Flow (required before job access)

- Step 1: W9 tax form with in-app signature canvas (federally required for 1099 contractors)
- Step 2: Bank account entry (routing + account number, AES-256 encrypted at rest) **or** Stripe Connect direct deposit setup
- Post-onboarding: both W9 and bank account can be updated at any time from the Profile page

#### Job Board

- Browse available route jobs with title, area, date, hours, and base pay
- Place or withdraw bids (smart bidding: weighted by driver rating, availability, and bid amount)
- Round-robin bid acceptance prevents monopolization by single drivers

#### Schedule

- Monthly calendar grid with job pills
- Day-detail panel listing confirmed and pending jobs
- List view toggle

#### Profile

- Personal info editing (name, phone)
- Weekly availability settings (days of week + start/end time)
- W9 status with inline "Update" button — opens a pre-populated W9 modal
- Bank account display (masked account number) with inline update form
- Message email opt-in toggle: receive an email when dispatch sends a new message

#### Messages

- Direct conversation with dispatch/admin
- Real-time WebSocket delivery

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS v4 |
| Backend | Express 5, TypeScript via `tsx` |
| Database | PostgreSQL (`pg` driver, `connect-pg-simple` session store) |
| Auth | `bcrypt` (12 rounds), `express-session`, Google OAuth 2.0 |
| Payments | Stripe — subscriptions, invoices, Connect (driver payouts), webhooks |
| Real-time | WebSocket (`ws`) for in-app chat |
| Email | Gmail API (Google Workspace service account or OAuth refresh token) |
| SMS | Twilio |
| Routing/Pickups | OptimoRoute API |
| Maps | Google Places API (address autocomplete) |
| Encryption | Node.js `crypto` — AES-256-GCM for ACH routing/account numbers |
| Security | Helmet, `express-rate-limit` (15-min lockout after 20 attempts), CORS |

---

## Project Structure

```text
/
├── index.html                      # Client portal entry
├── App.tsx                         # Client portal root component
├── main.tsx / index.tsx            # React 19 mount
├── PropertyContext.tsx             # Shared property/user context
├── types.ts                        # Shared TypeScript interfaces
│
├── components/                     # ~50 client portal components
│   ├── AuthLayout.tsx / Login.tsx / Registration.tsx
│   ├── Dashboard.tsx
│   ├── MyServiceHub.tsx
│   ├── Billing.tsx / BillingHub.tsx / MakePaymentHub.tsx
│   ├── ProfileSettings.tsx / SettingsHub.tsx
│   ├── Notifications.tsx           # Per-property notification prefs + message email opt-in
│   ├── PropertyManagement.tsx / PropertyCard.tsx
│   ├── ReferralsHub.tsx
│   ├── ChatWidget.tsx              # Floating chat widget (WebSocket)
│   ├── Header.tsx / Sidebar.tsx
│   └── ...
│
├── admin/                          # Admin portal (standalone SPA)
│   ├── index.html
│   ├── main.tsx
│   ├── App.tsx                     # 7-section sidebar shell
│   └── components/
│       ├── auth/                   # AdminAuthLayout, AdminLogin
│       ├── dashboard/              # DashboardView (charts, KPIs, activity)
│       ├── customers/              # CustomerList, CustomerDetail, EditCustomerModal, BulkNotifyDialog
│       ├── billing/                # BillingView
│       ├── operations/             # MissedPickupsList, PickupSchedule, JobsList, WeeklyPlanner, ActivityFeed, NotificationSender, CreateJobModal
│       ├── communications/         # CommunicationsView (tabbed: Conversations + Notifications)
│       ├── system/                 # AuditLog, AdminRoles
│       ├── team/                   # TeamView (driver roster)
│       └── ui/                     # Shared UI primitives
│
├── team/                           # Team portal (standalone SPA)
│   ├── index.html
│   ├── main.tsx
│   ├── App.tsx                     # Full team app (onboarding + 4-section sidebar + W9 modal)
│   └── components/
│       ├── TeamAuthLayout.tsx
│       ├── TeamLogin.tsx
│       └── TeamRegister.tsx
│
├── server/
│   ├── index.ts                    # Entry point — middleware, routing, static serving
│   ├── storage.ts                  # All database queries (no raw SQL in routes)
│   ├── schema.sql                  # Full PostgreSQL schema (auto-applied on startup)
│   ├── authRoutes.ts               # Customer auth (login, register, Google OAuth, password reset)
│   ├── routes.ts                   # Customer API
│   ├── adminRoutes.ts              # Admin API
│   ├── teamRoutes.ts               # Driver API (auth, onboarding, jobs, W9, bank account)
│   ├── communicationRoutes.ts      # Messaging API + WebSocket broadcast hooks
│   ├── websocket.ts                # WebSocket server
│   ├── notificationService.ts      # Email/SMS dispatcher (pickup reminders, billing alerts, message notifications)
│   ├── gmailClient.ts              # Gmail API (service account or OAuth)
│   ├── twilioClient.ts             # Twilio SMS
│   ├── stripeClient.ts             # Stripe client init
│   ├── webhookHandlers.ts          # Stripe webhook event processing
│   ├── optimoRouteClient.ts        # OptimoRoute API integration
│   ├── encryption.ts               # AES-256-GCM encrypt/decrypt for ACH data
│   ├── ensureAdmin.ts              # Auto-creates superadmin on every startup if missing
│   └── seed-products.ts            # Seed Stripe products/prices (dev utility)
│
├── services/
│   └── mockApiService.ts           # Client-side fetch wrappers
│
├── vite.config.ts                  # Multi-entry Vite build (3 SPAs → dist/)
├── package.json
└── tsconfig.json
```

---

## Prerequisites

- **Node.js** >= 20.x
- **npm** >= 10.x
- **PostgreSQL** >= 14

---

## Environment Variables

Create a `.env` file in the project root:

```env
# ─── Database ────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://username:password@localhost:5432/waste_management

# ─── Session ─────────────────────────────────────────────────────────────────
SESSION_SECRET=your-64-char-random-hex-string

# ─── Stripe ──────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# ─── Google OAuth (customer + driver login with Google) ──────────────────────
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret

# ─── Google Maps / Places (address autocomplete) ─────────────────────────────
GOOGLE_MAPS_API_KEY=your-google-maps-api-key

# ─── Gmail (transactional email) ─────────────────────────────────────────────
# Option A — Google Workspace service account (recommended)
GMAIL_SENDER_EMAIL=noreply@yourdomain.com
GMAIL_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"..."}

# Option B — OAuth2 refresh token (personal Gmail fallback)
# GMAIL_REFRESH_TOKEN=your-refresh-token
# (GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET also required)

# ─── Twilio (SMS notifications) ──────────────────────────────────────────────
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+15551234567

# ─── OptimoRoute (pickup tracking) ───────────────────────────────────────────
OPTIMOROUTE_API_KEY=your-optimoroute-api-key

# ─── Default superadmin (auto-created on startup if not present) ──────────────
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=change-this-in-production!

# ─── Domain & CORS ────────────────────────────────────────────────────────────
# Used for OAuth callbacks, Stripe webhooks, and CORS allow-list
APP_DOMAIN=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com

# ─── Encryption ───────────────────────────────────────────────────────────────
# 64-char hex string used for AES-256-GCM encryption of ACH account data
ENCRYPTION_KEY=your-64-char-hex-encryption-key
```

> **Note:** `SESSION_SECRET` and `ENCRYPTION_KEY` should be generated securely:
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Create the database
createdb waste_management

# 3. Create your .env file (see Environment Variables above)

# 4. Start dev servers (Express on :3001, Vite on :5000)
npm run dev

# 5. (Optional) Seed Stripe products
npm run seed
```

Dev URLs:

- Customer portal: `http://localhost:5000/`
- Admin portal: `http://localhost:5000/admin/`
- Team portal: `http://localhost:5000/team/`

Vite proxies all `/api` requests to the Express backend automatically during development.

The schema is applied automatically on first startup — no migration step required.

---

## Production Deployment

### Hostinger VPS

1. **Provision** an Ubuntu 22.04+ VPS.

2. **Install Node.js and PostgreSQL:**

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs postgresql postgresql-contrib
   sudo -u postgres createdb waste_management
   ```

3. **Clone and install:**

   ```bash
   git clone <repo-url> waste-management-portal
   cd waste-management-portal
   npm install
   ```

4. **Configure env and build:**

   ```bash
   cp .env.example .env   # fill in all values
   npm run build
   ```

5. **Run with PM2:**

   ```bash
   npm install -g pm2
   pm2 start npm --name "portal" -- run start
   pm2 save && pm2 startup
   ```

6. **Configure Nginx (with WebSocket support):**

   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   > The `Upgrade` / `Connection` headers are required for WebSocket chat to work.

7. **Enable HTTPS:**

   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

8. **Register Stripe webhook:** In the Stripe Dashboard, add `https://yourdomain.com/api/stripe/webhook` and subscribe to invoice and subscription events.

### Replit

The project is pre-configured for Replit:

1. Set all secrets in the **Secrets** tab (same keys as `.env`).
2. The `stripe-replit-sync` package auto-registers Stripe webhooks using `REPLIT_DOMAINS`.
3. Deployment config:
   - **Build:** `npm run build`
   - **Run:** `NODE_ENV=production npx tsx server/index.ts`

---

## Database Schema

All tables are created automatically from `server/schema.sql` on startup.

| Table | Purpose |
| --- | --- |
| `users` | Customer accounts, Stripe customer ID, message email opt-in |
| `properties` | Properties per user, service type, per-property notification prefs (JSONB) |
| `session` | Express session store (connect-pg-simple) |
| `password_reset_tokens` | Time-limited (1h) password reset tokens |
| `referral_codes` | One referral code per user |
| `referrals` | Referral events (pending/completed) with reward tracking |
| `service_alerts` | System-wide service alert banners |
| `missed_pickup_reports` | Customer-reported missed pickups with status and resolution notes |
| `special_pickup_requests` | On-demand special pickup orders |
| `collection_intents` | Pickup scheduling intentions per property/date |
| `driver_feedback` | Customer ratings and tips per pickup |
| `audit_log` | Admin action history (action, entity type/ID, details JSONB) |
| `admin_notes` | Internal notes and tags on customer accounts |
| `drivers` | Driver accounts, onboarding status, rating, Stripe Connect, message email opt-in |
| `driver_w9` | W9 form submissions (signature data, TIN info, encrypted ACH details) |
| `route_jobs` | Available route jobs (area, date, pay, status, assigned driver) |
| `job_bids` | Driver bids on route jobs (unique per job+driver) |
| `conversations` | Chat threads (direct or group, customer/driver/admin) |
| `conversation_participants` | Participants per conversation with last-read timestamp |
| `messages` | Individual messages with sender type and body |

---

## Available Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start backend (port 3001) and Vite dev server (port 5000) concurrently |
| `npm run dev:frontend` | Start Vite dev server only |
| `npm run dev:backend` | Start Express backend only |
| `npm run build` | Build all three SPAs to `dist/` |
| `npm run start` | Start production server (serves built `dist/`) |
| `npm run restart` | Kill port 5000, then start production server |
| `npm run preview` | Preview production build via Vite |
| `npm run seed` | Seed Stripe with default products and prices |

---

## API Reference

### Authentication — `/api/auth/`

| Method | Route | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Register customer (email/password) |
| POST | `/api/auth/login` | Login (email/password) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current session user |
| POST | `/api/auth/forgot-password` | Send password reset email |
| POST | `/api/auth/reset-password` | Reset password with token |
| GET | `/api/auth/google` | Start Google OAuth flow |
| GET | `/api/auth/google/callback` | Google OAuth callback |

### Customer API — `/api/`

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/properties` | List user properties |
| POST | `/api/properties` | Add a property |
| PUT | `/api/properties/:id` | Update property details |
| GET | `/api/billing/invoices` | Stripe invoices |
| GET | `/api/billing/subscriptions` | Stripe subscriptions |
| POST | `/api/billing/payment-intent` | Create Stripe payment intent |
| GET | `/api/pickup-status` | OptimoRoute pickup status |
| POST | `/api/referral/generate` | Generate referral code |
| GET | `/api/referral/stats` | Referral history and stats |
| POST | `/api/transfer/initiate` | Initiate property transfer |
| GET | `/api/conversations` | List customer conversations |
| POST | `/api/conversations/new` | Start new conversation with support |
| POST | `/api/conversations/:id/messages` | Send a message |
| PUT | `/api/conversations/:id/read` | Mark conversation as read |
| GET | `/api/profile/message-notifications` | Get message email opt-in status |
| PUT | `/api/profile/message-notifications` | Toggle message email notifications |

### Admin API — `/api/admin/`

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/admin/customers` | List all customers (paginated, searchable) |
| GET | `/api/admin/customers/:id` | Customer detail |
| PUT | `/api/admin/customers/:id` | Update customer info |
| GET | `/api/admin/stats` | Dashboard KPI cards |
| GET | `/api/admin/analytics` | Chart data (signups, revenue, breakdown) |
| GET | `/api/admin/audit-log` | Paginated audit log |
| POST | `/api/admin/notes` | Add note to customer |
| GET | `/api/admin/conversations` | All conversations |
| POST | `/api/admin/conversations` | Create conversation with customer or driver |
| POST | `/api/admin/conversations/:id/messages` | Send admin message |
| POST | `/api/admin/notify` | Send bulk email/SMS notification |
| GET | `/api/admin/drivers` | List drivers |
| POST | `/api/admin/drivers` | Create driver account |

### Team (Driver) API — `/api/team/`

| Method | Route | Description |
| --- | --- | --- |
| POST | `/api/team/auth/register` | Register a driver |
| POST | `/api/team/auth/login` | Driver login |
| POST | `/api/team/auth/logout` | Driver logout |
| GET | `/api/team/auth/me` | Current session driver |
| GET | `/api/team/auth/google` | Start Google OAuth (driver) |
| GET | `/api/team/auth/google/callback` | Google OAuth callback (driver) |
| GET | `/api/team/onboarding/status` | Onboarding completion status |
| POST | `/api/team/onboarding/w9` | Submit initial W9 form |
| GET | `/api/team/onboarding/w9` | Get existing W9 (sensitive fields stripped) |
| PUT | `/api/team/onboarding/w9` | Update W9 form |
| POST | `/api/team/onboarding/bank-account` | Submit/update direct deposit bank account |
| POST | `/api/team/onboarding/stripe-connect` | Start Stripe Connect onboarding |
| GET | `/api/team/profile` | Driver profile |
| PUT | `/api/team/profile` | Update profile (name, phone, availability) |
| GET | `/api/team/profile/bank-account` | Get masked bank account info |
| GET | `/api/team/profile/message-notifications` | Get message email opt-in status |
| PUT | `/api/team/profile/message-notifications` | Toggle message email notifications |
| GET | `/api/team/jobs` | Available route jobs |
| POST | `/api/team/jobs/:id/bid` | Place bid on a job |
| DELETE | `/api/team/jobs/:id/bid` | Withdraw bid |
| GET | `/api/team/schedule` | Driver's confirmed schedule |
| GET | `/api/team/conversations` | Driver conversations |
| POST | `/api/team/conversations/new` | Start new conversation with dispatch |
| POST | `/api/team/conversations/:id/messages` | Send message |
| PUT | `/api/team/conversations/:id/read` | Mark conversation as read |

---

## Architecture Notes

### Multi-SPA Build

Three independent SPAs share one `vite.config.ts` with multi-entry Rollup input:

```js
input: { main: 'index.html', admin: 'admin/index.html', team: 'team/index.html' }
```

Each portal has its own auth state, routing, and component tree. In production, Express routes `GET /admin/*` → `dist/admin/index.html`, `GET /team/*` → `dist/team/index.html`, and everything else → `dist/index.html`.

### Session Management

- Store: PostgreSQL via `connect-pg-simple` (`session` table)
- Key per portal: `req.session.userId` (customer/admin), `req.session.driverId` (driver)
- Cookie: `httpOnly: true`, `sameSite: lax`, `secure: 'auto'` — **must be `'auto'`, not `true`**, otherwise cookies are silently blocked on HTTP localhost
- `req.session.save(callback)` is called explicitly before responding or redirecting after setting session data (required with async session store and `saveUninitialized: false`)

### Security

- **Rate limiting:** 20 attempts per 15-minute window on auth endpoints
- **Password hashing:** bcrypt with 12 salt rounds
- **ACH encryption:** AES-256-GCM via `server/encryption.ts` — routing and account numbers are stored encrypted and decrypted only for display (masked) or payout processing
- **Helmet:** Sets standard security headers on every response
- **CSRF protection:** OAuth state tokens generated with `crypto.randomBytes`
- **Admin roles:** `superadmin` → mapped to `full_admin` in middleware; `support` and `viewer` have reduced access

### Real-time Chat

WebSocket connections are authenticated via the Express session (the `ws` upgrade request carries the session cookie). Messages are persisted in PostgreSQL and broadcast to all participants in the conversation via `broadcastToParticipants()`. Participants are identified as `user:<uuid>`, `driver:<uuid>`, or `admin:<uuid>`.

### Message Email Opt-in

When a message is created in any conversation, `communicationRoutes.ts` calls `sendMessageNotificationEmail()` for each non-sending participant. The function checks the recipient's `message_email_notifications` column (false by default) and sends a branded email only if opted in. The call is fire-and-forget — email failures never block the API response.

### Superadmin Auto-creation

`server/ensureAdmin.ts` runs on every startup. If no user with `ADMIN_EMAIL` exists, it creates one with `admin_role = 'superadmin'`. This guarantees the admin portal is always accessible even after a database wipe.

---

## License

Private — all rights reserved.
