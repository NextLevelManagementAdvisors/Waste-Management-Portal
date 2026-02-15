# Waste Management Client Portal

## Overview
A React + Vite frontend with an Express backend for a waste management client portal. Provides login/registration, dashboard, billing, service management, pickup tracking, and more. Stripe integration handles subscriptions, invoices, and payment processing with real Stripe API calls.

## Recent Changes
- 2026-02-15: Added real Stripe integration via Replit Stripe connector
- 2026-02-15: Built Express backend server (port 3001 dev / 5000 prod) with Stripe API routes
- 2026-02-15: Products/prices fetched directly from Stripe API (stripe-replit-sync backfill doesn't populate products table)
- 2026-02-15: Created seed script with 8 waste management products in Stripe
- 2026-02-15: Configured Vite proxy for /api routes in development
- 2026-02-15: Updated deployment to autoscale with backend serving static files in production

## Project Architecture
- **Frontend**: React 19 with TypeScript, Vite 6
- **Backend**: Express server (`server/index.ts`, `server/routes.ts`)
- **Stripe Client**: `server/stripeClient.ts` (uses Replit Stripe connector for secure key management)
- **Styling**: Tailwind CSS (loaded via CDN in index.html)
- **Entry Point**: `index.tsx` -> `App.tsx`
- **Components**: `components/` directory
- **Services**: `services/` directory (Gemini AI, Stripe frontend service, address lookup, etc.)
- **Config**: `vite.config.ts`, `tsconfig.json`
- **Database**: PostgreSQL (Replit built-in), used by stripe-replit-sync for webhook/sync data

## Key Design Decisions
- Products are queried directly from Stripe API (not from synced database) because stripe-replit-sync backfill doesn't populate the products table
- Stripe connector manages API keys securely (different keys for dev vs production)
- Backend runs on port 3001 in dev (Vite proxies /api), port 5000 in production (serves static files)
- Webhook endpoint at `/api/stripe/webhook` processes Stripe events

## Running
- Dev: `npm run dev` (Vite on port 5000, backend on port 3001, Vite proxies /api)
- Build: `npm run build` (outputs to `dist/`)
- Deployment: autoscale, `NODE_ENV=production npx tsx server/index.ts` serves both API and static files on port 5000
- Seed products: `npx tsx server/seed-products.ts`

## User Preferences
- Prefers real Stripe integration over mock data
- Wants actual payment processing infrastructure
