# Waste Management Client Portal

A full-stack waste management system with three portals: a **Client Portal** for customers, an **Admin Portal** for operations staff, and a **Team Member Portal** for 1099 contractor drivers.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Database Setup](#database-setup)
- [Available Scripts](#available-scripts)
- [Deploying to Hostinger](#deploying-to-hostinger)
- [Deploying to Replit](#deploying-to-replit)
- [Portals Overview](#portals-overview)
- [API Routes](#api-routes)

---

## Features

**Client Portal** (`/`)
- User registration and login (email/password + Google OAuth)
- Personalized dashboard with service overview
- Billing management with Stripe (subscriptions, invoices, payments)
- Property management with address autocomplete (Google Places)
- Pickup tracking via OptimoRoute API
- Referral system with unique codes and rewards
- Account and property transfer between users
- Notification preferences per property
- Password reset via email (Gmail API)

**Admin Portal** (`/admin/`)
- Analytics dashboard with signup trends and revenue charts
- Customer management with search, filter, CSV export, and bulk actions
- Billing tools (invoice creation, credit application, subscription management)
- Operations center (missed pickups, schedule, activity feed)
- Unified communications (real-time WebSocket chat with customers and drivers)
- Audit logging and customer impersonation
- Admin notes and tags on customer accounts

**Team Member Portal** (`/team/`)
- Driver registration and login
- Onboarding flow (W9 form with in-app signature + Stripe Connect direct deposit)
- Job board with smart bidding (round-robin weighted by rating/availability/bid)
- Monthly calendar and schedule view
- Driver profile with availability settings

---

## Tech Stack

| Layer       | Technology                                                |
|-------------|-----------------------------------------------------------|
| Frontend    | React 19, TypeScript, Vite 6, Tailwind CSS v4            |
| Backend     | Express 5, TypeScript (tsx)                               |
| Database    | PostgreSQL (with `pg` driver, `connect-pg-simple` sessions) |
| Auth        | `bcrypt` password hashing, `express-session`, Google OAuth |
| Payments    | Stripe (subscriptions, invoicing, Connect for driver payouts) |
| Real-time   | WebSocket (`ws`) for chat                                 |
| Email       | Gmail API (Google Workspace) for transactional emails     |
| Routing     | OptimoRoute API for pickup tracking and route optimization |
| Maps        | Google Places API for address autocomplete                |
| Security    | Helmet, express-rate-limit, CORS                          |

---

## Project Structure

```
/
├── index.html                  # Client portal entry
├── App.tsx                     # Client portal React app
├── main.tsx                    # Client portal React mount
├── components/                 # Client portal components
│   ├── AuthLayout.tsx
│   ├── Dashboard.tsx
│   ├── Billing.tsx
│   ├── BillingHub.tsx
│   ├── PickupTracking.tsx
│   └── ...
├── admin/                      # Admin portal (standalone SPA)
│   ├── index.html
│   ├── main.tsx
│   ├── App.tsx
│   └── components/
│       ├── DashboardView.tsx
│       ├── CustomersView.tsx
│       ├── BillingView.tsx
│       ├── OperationsView.tsx
│       ├── CommunicationsView.tsx
│       └── SystemView.tsx
├── team/                       # Team member portal (standalone SPA)
│   ├── index.html
│   ├── main.tsx
│   └── App.tsx
├── server/                     # Express backend
│   ├── index.ts                # Server entry, middleware, static serving
│   ├── authRoutes.ts           # Customer auth (login, register, OAuth, reset)
│   ├── routes.ts               # Customer API (billing, properties, pickups, etc.)
│   ├── adminRoutes.ts          # Admin API (customers, analytics, operations)
│   ├── teamRoutes.ts           # Driver API (auth, onboarding, jobs, bids)
│   ├── communicationRoutes.ts  # Messaging API (conversations, messages)
│   ├── websocket.ts            # WebSocket server for real-time chat
│   ├── storage.ts              # Database queries and data access layer
│   ├── stripeClient.ts         # Stripe client initialization and sync
│   ├── webhookHandlers.ts      # Stripe webhook event handlers
│   ├── gmailClient.ts          # Gmail API client for sending emails
│   ├── optimoRouteClient.ts    # OptimoRoute API client
│   ├── notificationService.ts  # Email/SMS notification service
│   └── seed-products.ts        # Seed Stripe products/prices
├── services/                   # Frontend service layer
├── vite.config.ts              # Vite config (multi-page build, proxy)
├── tsconfig.json               # TypeScript config
├── package.json                # Dependencies and scripts
└── replit.md                   # Replit project documentation
```

---

## Prerequisites

- **Node.js** >= 20.x
- **npm** >= 10.x
- **PostgreSQL** >= 14

---

## Environment Variables

Create a `.env` file in the project root (or set these in your hosting environment):

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/waste_management

# Session
SESSION_SECRET=your-random-64-char-secret

# Stripe
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_PUBLISHABLE_KEY=pk_live_or_test_...

# Google OAuth
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret

# Google Maps / Places
GOOGLE_MAPS_API_KEY=your-google-maps-api-key

# OptimoRoute
OPTIMOROUTE_API_KEY=your-optimoroute-api-key

# Gmail API (for sending emails)
# Requires Google Workspace service account or OAuth credentials
# configured via googleapis

# Domain (used for callbacks, webhooks, emails)
# On Replit this is set automatically via REPLIT_DOMAINS
# On other hosts, set your production domain:
APP_DOMAIN=https://yourdomain.com
```

---

## Running Locally

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-org/waste-management-portal.git
   cd waste-management-portal
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up PostgreSQL:**

   Create a database and set the `DATABASE_URL` environment variable.

   ```bash
   createdb waste_management
   export DATABASE_URL=postgresql://youruser:yourpass@localhost:5432/waste_management
   ```

   The application auto-creates all required tables on first startup.

4. **Set environment variables:**

   Copy the environment variables listed above into a `.env` file or export them in your shell.

5. **Start the development server:**

   ```bash
   npm run dev
   ```

   This starts both the Express backend (port 3001) and Vite dev server (port 5000) concurrently.

   - Client Portal: `http://localhost:5000/`
   - Admin Portal: `http://localhost:5000/admin/`
   - Team Portal: `http://localhost:5000/team/`

   The Vite dev server proxies `/api` requests to the Express backend automatically.

6. **(Optional) Seed Stripe products:**

   ```bash
   npm run seed
   ```

---

## Database Setup

The application uses PostgreSQL. All tables are created automatically on first run via the storage layer. Key tables include:

| Table                       | Purpose                                      |
|-----------------------------|----------------------------------------------|
| `users`                     | Customer accounts and Stripe customer IDs    |
| `properties`                | Customer properties with service preferences |
| `session`                   | Express session store (PostgreSQL-backed)     |
| `password_reset_tokens`     | Time-limited password reset tokens           |
| `referral_codes` / `referrals` | Referral tracking and rewards             |
| `missed_pickup_reports`     | Customer-reported missed pickups             |
| `special_pickup_requests`   | On-demand special pickup scheduling          |
| `audit_log`                 | Admin action audit trail                     |
| `admin_notes`               | Internal notes on customer accounts          |
| `conversations` / `messages`| Real-time messaging system                   |
| `drivers`                   | Driver accounts with auth and onboarding     |
| `driver_w9`                 | W9 form submissions                          |
| `route_jobs`                | Available route jobs for drivers             |
| `job_bids`                  | Driver bids on route jobs                    |
| `stripe.*`                  | Stripe sync schema (managed by stripe-replit-sync) |

---

## Available Scripts

| Command              | Description                                         |
|----------------------|-----------------------------------------------------|
| `npm run dev`        | Start both backend and frontend in development mode |
| `npm run dev:frontend` | Start only the Vite frontend dev server           |
| `npm run dev:backend`  | Start only the Express backend                    |
| `npm run build`      | Build the frontend for production (outputs to `dist/`) |
| `npm run start`      | Start the production server (serves built frontend) |
| `npm run preview`    | Preview the production build locally via Vite       |
| `npm run seed`       | Seed Stripe with default products and prices        |

---

## Deploying to Hostinger

Hostinger VPS or Cloud hosting is recommended for this full-stack application since it requires Node.js and PostgreSQL.

### Option A: Hostinger VPS

1. **Provision a VPS** with Ubuntu 22.04+ on Hostinger.

2. **Install Node.js 20+ and PostgreSQL:**

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs postgresql postgresql-contrib
   ```

3. **Set up the database:**

   ```bash
   sudo -u postgres createuser --interactive   # create your db user
   sudo -u postgres createdb waste_management
   ```

4. **Clone and install:**

   ```bash
   git clone https://github.com/your-org/waste-management-portal.git
   cd waste-management-portal
   npm install
   ```

5. **Configure environment variables:**

   ```bash
   cp .env.example .env
   nano .env   # fill in all values (DATABASE_URL, Stripe keys, etc.)
   ```

   Make sure `APP_DOMAIN` is set to your VPS domain or IP.

6. **Build the frontend:**

   ```bash
   npm run build
   ```

7. **Set up a process manager (PM2):**

   ```bash
   npm install -g pm2
   pm2 start npm --name "waste-portal" -- run start
   pm2 save
   pm2 startup   # auto-start on reboot
   ```

8. **Set up Nginx as a reverse proxy:**

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
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   The WebSocket upgrade headers are important for the real-time chat feature.

9. **Enable SSL with Let's Encrypt:**

   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

10. **Set up Stripe webhooks:**

    In your Stripe Dashboard, add a webhook endpoint pointing to:
    `https://yourdomain.com/api/stripe/webhook`

    Subscribe to relevant events (invoice.paid, customer.subscription.updated, etc.)

### Option B: Hostinger Cloud Hosting (Node.js)

If Hostinger offers Node.js hosting:

1. Upload the project files via Git or FTP.
2. Set the Node.js entry point to `npm run start`.
3. Set environment variables in the Hostinger dashboard.
4. Ensure PostgreSQL is available (use Hostinger's database service or an external provider like Neon, Supabase, or Railway).
5. Run `npm run build` as a build step before starting.
6. Configure your domain's DNS to point to the Hostinger server.

---

## Deploying to Replit

The project is pre-configured for Replit deployment:

1. The built-in PostgreSQL database is used automatically via `DATABASE_URL`.
2. Set all API keys in the Secrets tab (Stripe, Google OAuth, Google Maps, OptimoRoute).
3. Click **Publish** to deploy. The deploy config is already set:
   - Build: `npm run build`
   - Run: `NODE_ENV=production npx tsx server/index.ts`

---

## Portals Overview

### Client Portal (`/`)
The main customer-facing portal. Users sign up, manage properties, view bills, track pickups, and communicate with support.

### Admin Portal (`/admin/`)
Internal operations dashboard. Admins manage customers, handle billing, resolve missed pickups, view analytics, and chat with customers and drivers in real-time.

### Team Member Portal (`/team/`)
Contractor driver portal. Drivers complete onboarding (W9 + bank account), browse and bid on available route jobs, manage their schedule, and update their profile.

---

## API Routes

### Authentication (`/api/auth/`)
| Method | Route                    | Description                    |
|--------|--------------------------|--------------------------------|
| POST   | `/api/auth/register`     | Register a new customer        |
| POST   | `/api/auth/login`        | Log in with email/password     |
| POST   | `/api/auth/logout`       | Log out                        |
| GET    | `/api/auth/me`           | Get current user               |
| POST   | `/api/auth/forgot-password` | Request password reset      |
| POST   | `/api/auth/reset-password`  | Reset password with token   |
| GET    | `/api/auth/google`       | Initiate Google OAuth flow     |
| GET    | `/api/auth/google/callback` | Google OAuth callback       |

### Customer API (`/api/`)
| Method | Route                              | Description                     |
|--------|------------------------------------|---------------------------------|
| GET    | `/api/properties`                  | List user properties            |
| POST   | `/api/properties`                  | Add a property                  |
| GET    | `/api/billing/invoices`            | Get Stripe invoices             |
| GET    | `/api/billing/subscriptions`       | Get Stripe subscriptions        |
| POST   | `/api/billing/payment-intent`      | Create a payment intent         |
| GET    | `/api/pickup-status`               | Get OptimoRoute pickup status   |
| POST   | `/api/referral/generate`           | Generate referral code          |
| POST   | `/api/transfer/initiate`           | Initiate property transfer      |

### Admin API (`/api/admin/`)
| Method | Route                              | Description                     |
|--------|------------------------------------|---------------------------------|
| GET    | `/api/admin/customers`             | List all customers              |
| GET    | `/api/admin/analytics`             | Dashboard analytics             |
| GET    | `/api/admin/audit-log`             | View audit log                  |
| POST   | `/api/admin/notes`                 | Add customer note               |

### Team API (`/api/team/`)
| Method | Route                              | Description                     |
|--------|------------------------------------|---------------------------------|
| POST   | `/api/team/auth/register`          | Register a new driver           |
| POST   | `/api/team/auth/login`             | Driver login                    |
| POST   | `/api/team/onboarding/w9`          | Submit W9 form                  |
| POST   | `/api/team/onboarding/stripe-connect` | Start Stripe Connect setup   |
| GET    | `/api/team/jobs`                   | List available jobs             |
| POST   | `/api/team/jobs/:id/bid`           | Place a bid on a job            |
| GET    | `/api/team/schedule`               | Get driver schedule             |
| GET    | `/api/team/profile`                | Get driver profile              |
| PUT    | `/api/team/profile`                | Update driver profile           |

### Communications (`/api/conversations/`)
| Method | Route                              | Description                     |
|--------|------------------------------------|---------------------------------|
| GET    | `/api/conversations`               | List conversations              |
| POST   | `/api/conversations`               | Create conversation             |
| POST   | `/api/conversations/:id/messages`  | Send a message                  |
| GET    | `/api/conversations/:id/messages`  | Get message history             |

---

## License

Private. All rights reserved.
