# Waste Management Client Portal

## Overview
A comprehensive client portal for waste management, featuring a React + Vite frontend and an Express backend. It enables users to manage their waste services through functionalities like login/registration, a personalized dashboard, billing management, service scheduling, and pickup tracking. The system integrates with Stripe for real-time subscription, invoicing, and payment processing, and offers robust user authentication with database-backed accounts and session management. The project aims to provide a seamless and efficient experience for waste management clients, offering strong market potential by streamlining operations and enhancing customer satisfaction.

## User Preferences
- Prefers real Stripe integration over mock data
- Wants actual payment processing infrastructure
- Wants real user authentication with database-backed accounts

## System Architecture
The project utilizes a React 19 frontend with TypeScript and Vite 6, paired with an Express backend. Authentication is session-based, using `express-session` and `connect-pg-simple` for PostgreSQL-backed session storage, `bcrypt` for password hashing, and Google OAuth for streamlined login. Styling is managed with Tailwind CSS v4 via `@tailwindcss/vite` plugin.

**Key Features:**
- **Admin Dashboard:** A comprehensive admin portal at `/admin/` with analytics, customer management, billing tools, operations views, audit logging, global search, and customer impersonation.
- **Team Member Portal:** Standalone driver portal at `/team/` for 1099 contractors. Includes driver registration/login, onboarding flow (W9 form + Stripe Connect direct deposit), job board with smart bidding (round-robin weighted by rating/availability/bid amount), calendar/schedule view, and driver profile management.
- **Unified Communications:** Real-time messaging system with WebSocket support. Admins can chat with customers and drivers (1-on-1 or 3-way). Customer-side floating chat widget. All message history stored in PostgreSQL.
- **User Authentication & Management:** Secure login, registration (auto-creates Stripe customer and links existing ones), password reset flows via Gmail, and Google OAuth. User and property data are stored in PostgreSQL.
- **Service Management:** Users can add properties, manage service types, and track special pickup requests.
- **Billing & Payments:** Real Stripe integration for invoices, subscriptions, and payment processing. Invoice PDFs and hosted URLs are available.
- **Pickup Tracking:** Integration with OptimoRoute API for real-time pickup status, route scheduling, and order creation.
- **Notifications:** Comprehensive notification system (email/SMS) for pickup reminders, billing alerts, service updates, and missed pickup confirmations, with customizable preferences stored per property.
- **Referral System:** Users can generate unique referral codes, track referrals, and benefit from rewards.
- **Account & Property Transfer:** Secure tokenized system for transferring property ownership between users via email invitations.
- **Address Autocomplete:** Google Places integration for address suggestions in forms.
- **Deep Linking:** Robust URL-based routing ensuring seamless navigation and state preservation across authentication flows.

**Database Schema Highlights (PostgreSQL):**
- `users`: Stores user credentials, profile information, and `stripe_customer_id`.
- `properties`: Links to users, stores address, service type, and JSONB for notification preferences.
- `session`, `password_reset_tokens`, `referral_codes`, `referrals`, `missed_pickup_reports`, `special_pickup_requests`, `collection_intents`, `driver_feedback`: Tables for specific feature data.
- `audit_log`: Tracks all admin actions (who did what, when, to which entity).
- `admin_notes`: Internal notes/tags on customers, linked to admin who created them.
- `conversations`, `conversation_participants`, `messages`: Unified communications system for admin-customer-driver messaging.
- `drivers`: Driver profiles with auth (password_hash), onboarding status, rating, Stripe Connect account, W9/deposit completion flags, availability (JSONB).
- `driver_w9`: W9 form submissions linked to drivers (legal name, tax classification, TIN, address, signature data).
- `route_jobs`: Available route jobs with scheduling, pay, status tracking, and driver assignment.
- `job_bids`: Driver bids on route jobs with bid amount, message, and driver rating at time of bid.
- `stripe.*`: Schema managed by `stripe-replit-sync` for webhook and sync data.

**Admin Portal Structure (admin/) — 6-Section Relational Navigation:**
- `admin/App.tsx`: Main admin app with 6-item sidebar (Dashboard, Customers, Billing, Operations, Communications, System), global search, view routing
- `admin/components/shared.tsx`: Shared components (LoadingSpinner, StatCard, Pagination, StatusBadge, EmptyState, FilterBar, ConfirmDialog)
- `admin/components/DashboardView.tsx`: Unified dashboard merging overview stats cards with analytics charts (signup trends, revenue, service breakdown)
- `admin/components/CustomersView.tsx`: Central relational hub — customer list with search/filter/CSV export/bulk actions; detail panel with tabs: Overview (contact + notes), Properties, Billing (Stripe subscriptions/invoices/payment methods), Activity (audit log filtered by customer)
- `admin/components/BillingView.tsx`: Global billing view — invoice creation, credit application, subscription management, payment history
- `admin/components/OperationsView.tsx`: Tabbed operations center — Missed Pickups (with resolution tracking), Pickup Schedule, Recent Activity (signups/pickups/referrals), Notifications (send to customers)
- `admin/components/CommunicationsView.tsx`: Unified inbox for all conversations — thread view with real-time WebSocket chat, new conversation modal with customer/driver selection, 3-way chat support
- `admin/components/SystemView.tsx`: Audit log viewer, global search, settings/roles placeholder

**Team Member Portal Structure (team/):**
- `team/App.tsx`: Main team portal app with driver auth (login/register), onboarding gate, 4-view sidebar (Dashboard, Available Jobs, My Schedule, Profile)
- Onboarding flow: W9 form (fillable with signature canvas) + Stripe Connect direct deposit setup
- Job board: Browse available routes, view details/bids, place/withdraw bids with round-robin weighted system
- Calendar: Monthly calendar grid with job pills, day detail panel, list view toggle
- Profile: Driver info, availability settings (day-of-week + preferred hours), W9/deposit status

## External Dependencies
- **Stripe:** For payment processing, subscriptions, invoicing, and customer management. Utilizes Replit Stripe connector for secure API key management.
- **OptimoRoute:** For pickup tracking, route optimization, and order management.
- **Google OAuth:** For "Sign in with Google" functionality.
- **Google Places API:** For address autocomplete in forms.
- **Gmail API (Google Workspace):** For sending password reset emails, account transfer invitations, and various user notifications.
- **PostgreSQL:** The primary database for storing user, property, session, and application-specific data.