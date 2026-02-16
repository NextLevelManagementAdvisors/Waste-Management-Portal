# Waste Management Client Portal

## Overview
A React + Vite frontend with an Express backend for a waste management client portal. Provides login/registration, dashboard, billing, service management, pickup tracking, and more. Stripe integration handles subscriptions, invoices, and payment processing with real Stripe API calls. Real user authentication with database-backed accounts and session management.

## Recent Changes
- 2026-02-16: Added forgot password / reset password flow with Gmail integration (Google Workspace)
- 2026-02-16: password_reset_tokens table for secure, single-use, 1-hour expiry tokens
- 2026-02-16: ForgotPassword and ResetPassword UI components with full state handling
- 2026-02-16: Gmail sends reset emails via googleapis OAuth2 client (server/gmailClient.ts)
- 2026-02-16: Implemented real user authentication with PostgreSQL-backed users/properties tables
- 2026-02-16: Session-based auth using express-session + connect-pg-simple (sessions stored in DB)
- 2026-02-16: Registration auto-creates Stripe customer and stores stripe_customer_id
- 2026-02-16: Frontend auth calls real API endpoints (login, register, logout, session check on load)
- 2026-02-16: Property CRUD routes linked to authenticated user
- 2026-02-16: Profile and password update routes with email uniqueness validation
- 2026-02-15: Added real Stripe integration via Replit Stripe connector
- 2026-02-15: Built Express backend server (port 3001 dev / 5000 prod) with Stripe API routes
- 2026-02-15: Products/prices fetched directly from Stripe API (stripe-replit-sync backfill doesn't populate products table)
- 2026-02-15: Created seed script with 8 waste management products in Stripe
- 2026-02-15: Configured Vite proxy for /api routes in development
- 2026-02-15: Updated deployment to autoscale with backend serving static files in production

## Project Architecture
- **Frontend**: React 19 with TypeScript, Vite 6
- **Backend**: Express server (`server/index.ts`, `server/routes.ts`, `server/authRoutes.ts`)
- **Auth**: Session-based auth with bcrypt password hashing, express-session + connect-pg-simple
- **Gmail**: `server/gmailClient.ts` (Google Workspace integration for password reset emails)
- **Stripe Client**: `server/stripeClient.ts` (uses Replit Stripe connector for secure key management)
- **Styling**: Tailwind CSS (loaded via CDN in index.html)
- **Entry Point**: `index.tsx` -> `App.tsx`
- **Components**: `components/` directory
- **Services**: `services/` directory (Gemini AI, Stripe frontend service, address lookup, etc.)
- **Config**: `vite.config.ts`, `tsconfig.json`
- **Database**: PostgreSQL (Replit built-in)
  - `users` table: id (uuid), first_name, last_name, phone, email, password_hash, member_since, autopay_enabled, stripe_customer_id
  - `properties` table: id (uuid), user_id (fk), address, service_type, notification_preferences (jsonb), etc.
  - `session` table: connect-pg-simple session store
  - `password_reset_tokens` table: id (uuid), user_id (fk), token (varchar unique), expires_at (timestamp), used (boolean)
  - `stripe.*` schema: managed by stripe-replit-sync for webhook/sync data

## Key Design Decisions
- Products are queried directly from Stripe API (not from synced database) because stripe-replit-sync backfill doesn't populate the products table
- Stripe connector manages API keys securely (different keys for dev vs production)
- Backend runs on port 3001 in dev (Vite proxies /api), port 5000 in production (serves static files)
- Webhook endpoint at `/api/stripe/webhook` processes Stripe events
- Session-based auth (not JWT) - sessions stored in PostgreSQL via connect-pg-simple
- Registration auto-creates Stripe customer; stripe_customer_id stored in users table and set in frontend stripeService on login/register/session restore
- App checks for existing session on load via GET /api/auth/me

## Auth Routes
- POST `/api/auth/register` - Create account (auto-creates Stripe customer)
- POST `/api/auth/login` - Login with email/password
- POST `/api/auth/logout` - Destroy session
- GET `/api/auth/me` - Get current user from session
- PUT `/api/auth/profile` - Update profile (with email uniqueness check)
- PUT `/api/auth/password` - Change password (verifies current password)
- POST `/api/auth/forgot-password` - Send password reset email via Gmail
- GET `/api/auth/verify-reset-token` - Check if reset token is valid
- POST `/api/auth/reset-password` - Reset password with valid token
- POST `/api/properties` - Add property (requires auth)
- PUT `/api/properties/:id` - Update property (requires auth + ownership)

## Running
- Dev: `npm run dev` (Vite on port 5000, backend on port 3001, Vite proxies /api)
- Build: `npm run build` (outputs to `dist/`)
- Deployment: autoscale, `NODE_ENV=production npx tsx server/index.ts` serves both API and static files on port 5000
- Seed products: `npx tsx server/seed-products.ts`

## User Preferences
- Prefers real Stripe integration over mock data
- Wants actual payment processing infrastructure
- Wants real user authentication with database-backed accounts
