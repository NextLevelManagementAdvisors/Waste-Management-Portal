# Waste Management Client Portal

## Overview
A React + Vite frontend with an Express backend for a waste management client portal. Provides login/registration, dashboard, billing, service management, pickup tracking, and more. Stripe integration handles subscriptions, invoices, and payment processing with real Stripe API calls. Real user authentication with database-backed accounts and session management.

## Recent Changes
- 2026-02-16: Admin Dashboard with back-office views: Overview stats, Customer management with Stripe details, Properties list, Activity feed
- 2026-02-16: Admin routes (server/adminRoutes.ts) protected by is_admin flag on users table
- 2026-02-16: Admin notification API (POST /api/admin/notify) for sending pickup reminders, billing alerts, service updates
- 2026-02-16: Email notification service (server/notificationService.ts) with HTML templates for pickup reminders, billing alerts, payment confirmations, service updates, missed pickup confirmations
- 2026-02-16: Notifications auto-sent on missed pickup reports and special pickup scheduling
- 2026-02-16: SettingsHub with tabbed interface (Profile/Notifications/Security) replacing old single-page settings
- 2026-02-16: Notification preferences expanded: pickup (email/sms per property), billing (invoiceDue, paymentConfirmation, autopayReminder), account (serviceUpdates, promotions, referralUpdates)
- 2026-02-16: All notification preferences persisted to DB via property notification_preferences JSONB
- 2026-02-16: Invoice PDF download links and hosted invoice URLs from Stripe data
- 2026-02-16: Invoice numbers displayed instead of IDs (where available from Stripe)
- 2026-02-16: Admin sidebar nav link visible only to admin users
- 2026-02-16: Registration now searches Stripe for existing customer by email before creating new (links existing customer if found)
- 2026-02-16: Google OAuth signup also checks for existing Stripe customer by email
- 2026-02-16: ensureStripeCustomer() helper auto-links Stripe customer on login/session restore if portal user has no stripe_customer_id
- 2026-02-16: Multi-customer handling: when multiple Stripe customers share an email, selects the one with active subscriptions
- 2026-02-16: MyServiceHub shows "Welcome Back" view for users with existing Stripe subscriptions but no portal properties
- 2026-02-16: Loading state guard prevents flashing setup wizard while subscription check is in progress
- 2026-02-16: Replaced Tailwind CDN with proper @tailwindcss/vite build plugin and app.css with @theme tokens
- 2026-02-16: Implemented real Stripe invoice creation (POST /api/invoices) - replaces console.log stub
- 2026-02-16: Special pickup scheduling now creates OptimoRoute orders and real Stripe invoices server-side
- 2026-02-16: Built referral system with DB tables (referral_codes, referrals), API route (GET /api/referrals), auto-generated unique codes per user
- 2026-02-16: Referral code processing during registration - creates pending referral linked to referrer
- 2026-02-16: Registration form includes optional referral code field, auto-fills from ?ref= URL param
- 2026-02-16: Built account transfer backend with tokenized invitations, Gmail email sending, and accept flow
- 2026-02-16: Account transfer API routes: POST /api/account-transfer, POST /api/account-transfer/remind, GET /api/account-transfer/:token, POST /api/account-transfer/:token/accept
- 2026-02-16: Wired frontend transferPropertyOwnership() and sendTransferReminder() to real API endpoints
- 2026-02-16: Security fix: /api/invoices derives customerId from session user (no arbitrary customer access)
- 2026-02-16: Implemented deep linking / URL-based routing for all views
- 2026-02-16: Removed Start Service as standalone view; onboarding now handled inline within Manage Plan (MyServiceHub)
- 2026-02-16: Deep link query params: /manage-plan?type=recurring (recurring plan setup) vs /manage-plan?type=request (one-time service request)
- 2026-02-16: Query params preserved through auth flows (login, register, Google OAuth) via pendingDeepLinkQuery state
- 2026-02-16: StartService component branches Step 3 based on serviceFlowType: 'request' shows standalone services only, default shows full recurring plan flow
- 2026-02-16: View-to-path mappings: / (home), /manage-plan, /wallet, /pay, /requests, /referrals, /help, /settings
- 2026-02-16: Auth routes: /login, /register, /forgot-password, /reset-password?token=...
- 2026-02-16: Browser back/forward navigation syncs view state via popstate listener
- 2026-02-16: Deep link preservation: unauthenticated users visiting protected URLs are redirected to login, then navigated to intended page after successful login
- 2026-02-16: Sidebar nav links use semantic href attributes for accessibility
- 2026-02-16: Integrated real OptimoRoute API for pickup tracking, route scheduling, and order creation
- 2026-02-16: Backend OptimoRoute client (server/optimoRouteClient.ts) handles search_orders, get_routes, get_scheduling_info, get_completion_details, create_order
- 2026-02-16: Backend API routes proxy OptimoRoute calls (next-pickup, history, routes, search, create-order)
- 2026-02-16: Frontend optimoRouteService.ts now calls backend API routes instead of using mock data
- 2026-02-16: Dashboard dynamically determines pickup status from real OptimoRoute data (no more hardcoded P1/P2/P3 states)
- 2026-02-16: Wired all user interactions to real database-backed APIs (autopay, notifications, missed pickups, special pickups, collection intents, driver feedback/tips)
- 2026-02-16: Added 13 new API endpoints for persisting user data with auth + property ownership checks
- 2026-02-16: Frontend mockApiService now calls real APIs with graceful fallbacks
- 2026-02-16: Added Google Places address autocomplete to AddPropertyModal and StartService
- 2026-02-16: Created reusable AddressAutocomplete component (lazy-loads Google Maps JS)
- 2026-02-16: Backend /api/google-maps-key endpoint serves API key for Places autocomplete
- 2026-02-16: Added Google OAuth login ("Sign in with Google") on Login and Registration pages
- 2026-02-16: Google OAuth routes: GET /api/auth/google (initiate) and GET /api/auth/google/callback (handle callback)
- 2026-02-16: Google OAuth auto-creates user account + Stripe customer if new, or logs in existing user by email
- 2026-02-16: Fixed StripeProvider to always wrap children in Elements (prevents useStripe crash)
- 2026-02-16: Fixed catch-all route for production (app.use middleware instead of app.get('*'))
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
- **Auth**: Session-based auth with bcrypt password hashing, express-session + connect-pg-simple, Google OAuth login
- **Gmail**: `server/gmailClient.ts` (Google Workspace integration for password reset emails + account transfer invitations)
- **Stripe Client**: `server/stripeClient.ts` (uses Replit Stripe connector for secure key management)
- **Styling**: Tailwind CSS v4 via @tailwindcss/vite plugin (app.css with @theme tokens)
- **Entry Point**: `index.tsx` -> `App.tsx`
- **Components**: `components/` directory
- **Services**: `services/` directory (Gemini AI, Stripe frontend service, address lookup, etc.)
- **Config**: `vite.config.ts`, `tsconfig.json`
- **Database**: PostgreSQL (Replit built-in)
  - `users` table: id (uuid), first_name, last_name, phone, email, password_hash, member_since, autopay_enabled, stripe_customer_id
  - `properties` table: id (uuid), user_id (fk), address, service_type, notification_preferences (jsonb), transfer_status, pending_owner (jsonb), transfer_token, transfer_token_expires
  - `session` table: connect-pg-simple session store
  - `password_reset_tokens` table: id (uuid), user_id (fk), token (varchar unique), expires_at (timestamp), used (boolean)
  - `referral_codes` table: id (uuid), user_id (fk unique), code (varchar unique)
  - `referrals` table: id (uuid), referrer_user_id (fk), referred_email, referred_name, status (pending/completed), reward_amount, completed_at
  - `missed_pickup_reports` table: user_id, property_id, pickup_date, notes
  - `special_pickup_requests` table: user_id, property_id, service_name, service_price, pickup_date, status
  - `collection_intents` table: user_id, property_id, intent, pickup_date
  - `driver_feedback` table: user_id, property_id, pickup_date, rating, tip_amount, note
  - `stripe.*` schema: managed by stripe-replit-sync for webhook/sync data

## Key Design Decisions
- Products are queried directly from Stripe API (not from synced database) because stripe-replit-sync backfill doesn't populate the products table
- Stripe connector manages API keys securely (different keys for dev vs production)
- Backend runs on port 3001 in dev (Vite proxies /api), port 5000 in production (serves static files)
- Webhook endpoint at `/api/stripe/webhook` processes Stripe events
- Session-based auth (not JWT) - sessions stored in PostgreSQL via connect-pg-simple
- Registration auto-creates Stripe customer; stripe_customer_id stored in users table and set in frontend stripeService on login/register/session restore
- App checks for existing session on load via GET /api/auth/me
- Special pickup scheduling creates both OptimoRoute orders AND Stripe invoices server-side (non-blocking)
- Account transfers use tokenized email invitations with 7-day expiry
- Referral codes are auto-generated per user and tracked in DB; referrals created during registration with ?ref= param

## Auth Routes
- POST `/api/auth/register` - Create account (auto-creates Stripe customer, processes referral code)
- POST `/api/auth/login` - Login with email/password
- POST `/api/auth/logout` - Destroy session
- GET `/api/auth/me` - Get current user from session
- PUT `/api/auth/profile` - Update profile (with email uniqueness check)
- PUT `/api/auth/password` - Change password (verifies current password)
- POST `/api/auth/forgot-password` - Send password reset email via Gmail
- GET `/api/auth/verify-reset-token` - Check if reset token is valid
- POST `/api/auth/reset-password` - Reset password with valid token
- GET `/api/auth/google` - Initiate Google OAuth login flow
- GET `/api/auth/google/callback` - Handle Google OAuth callback (creates account if new, logs in if existing)
- POST `/api/properties` - Add property (requires auth)
- PUT `/api/properties/:id` - Update property (requires auth + ownership)

## Additional API Routes
- POST `/api/invoices` - Create real Stripe invoice (derives customer from session, requires auth)
- GET `/api/referrals` - Get user's referral code, share link, referral list, and total rewards
- POST `/api/account-transfer` - Initiate property transfer (sends email invitation via Gmail)
- POST `/api/account-transfer/remind` - Send reminder email for pending transfer
- GET `/api/account-transfer/:token` - Fetch transfer invitation details (public)
- POST `/api/account-transfer/:token/accept` - Accept transfer (requires auth)

## Running
- Dev: `npm run dev` (Vite on port 5000, backend on port 3001, Vite proxies /api)
- Build: `npm run build` (outputs to `dist/`)
- Deployment: autoscale, `NODE_ENV=production npx tsx server/index.ts` serves both API and static files on port 5000
- Seed products: `npx tsx server/seed-products.ts`

## User Preferences
- Prefers real Stripe integration over mock data
- Wants actual payment processing infrastructure
- Wants real user authentication with database-backed accounts
