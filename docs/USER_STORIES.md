# User Stories — Rural Waste Management Portal

Complete inventory of user stories across all three portals (Customer, Admin, Team/Driver), derived from a full codebase audit. Each story follows the format: **As a [role], I want to [action], so that [benefit].**

**Status key:** Done = fully implemented | Partial = partially implemented | — = not yet started

---

## 1. CUSTOMER PORTAL

> **Audit summary (2026-03-02):** 89 original stories + 20 new stories = 109 total.
> Done: 85 | Partial: 3 (C-79, C-80, C-81) | Not started: 17 (C-82, C-87, C-90–C-104).
> Full gap analysis: [`docs/GAP_ANALYSIS.md`](GAP_ANALYSIS.md) (if created) or see plan file.

### 1.1 Authentication & Account

| # | Status | User Story |
|---|--------|-----------|
| C-1 | Done | As a customer, I want to register with my email and password, so that I can create an account and start service. |
| C-2 | Done | As a customer, I want to sign up with Google SSO, so that I can register without creating a new password. |
| C-3 | Done | As a customer, I want to log in with my email and password, so that I can access my account. |
| C-4 | Done | As a customer, I want to log in with Google SSO, so that I can access my account quickly. |
| C-5 | Done | As a customer, I want to be locked out after 5 failed login attempts (15-min cooldown), so that my account is protected from brute-force attacks. <!-- Note: lockout is in-memory only; resets on server restart --> |
| C-6 | Done | As a customer, I want to request a password reset email, so that I can regain access if I forget my password. |
| C-7 | Done | As a customer, I want to reset my password via a time-limited token (1 hour), so that the reset link can't be reused indefinitely. |
| C-8 | Done | As a customer, I want to log out and have my session destroyed, so that nobody else can access my account on a shared device. |

### 1.2 Dashboard

| # | Status | User Story |
|---|--------|-----------|
| C-9 | Done | As a customer, I want to see a dashboard with quick actions (Start Service, Pay Balance, Extra Pickup, Report Issue, Manage Plan, Referral), so that I can navigate to common tasks in one click. |
| C-10 | Done | As a customer, I want to see my upcoming collection dates per location, so that I know when to put my bins out. |
| C-11 | Done | As a customer, I want to see my total monthly cost and outstanding balance at a glance, so that I stay informed about my billing. |
| C-12 | Done | As a customer, I want to see payment alerts for past-due subscriptions, so that I can pay before service is interrupted. |
| C-13 | Done | As a customer, I want to be prompted to tip my driver after a successful collection, so that I can show appreciation for good service. |
| C-14 | Done | As a customer, I want to dismiss the tip prompt and not see it again for that collection, so that I'm not nagged repeatedly. |
| C-15 | Done | As a customer, I want to see an AI Concierge card on my dashboard, so that I can quickly access support. |
| C-16 | Done | As a customer with multiple locations, I want to switch between locations or view "All" aggregated data, so that I can manage everything from one dashboard. |

### 1.3 Service Setup & Onboarding

| # | Status | User Story |
|---|--------|-----------|
| C-17 | Done | As a customer, I want to enter my address and have it validated against the service area, so that I know upfront if service is available. |
| C-18 | Done | As a customer, I want to use address autocomplete (Google Maps), so that I can enter my address quickly and accurately. |
| C-19 | Done | As a customer, I want to specify my location type (personal, commercial, short-term, rental, other), so that the system can recommend appropriate services. |
| C-20 | Done | As a customer, I want to provide location details (HOA status, community name, gate code, service notes), so that drivers can access my location and follow any special instructions. |
| C-21 | Done | As a customer, I want to browse and select from available services with pricing by frequency (weekly, bi-weekly, monthly, one-time), so that I can choose the plan that fits my needs. |
| C-22 | Done | As a customer, I want to get AI-based service recommendations from uploaded photos of my waste, so that I select the right service size. |
| C-23 | Done | As a customer, I want to add a payment method (card or bank account) via Stripe during signup, so that billing is set up before my first collection. |
| C-24 | Done | As a customer, I want my location to enter a "pending review" state after submission, so that an admin can verify serviceability before I'm charged. |
| C-25 | Done | As a customer, I want to be notified when my address is approved, denied, or waitlisted, so that I know the status of my service request. |

### 1.4 Service Management

| # | Status | User Story |
|---|--------|-----------|
| C-26 | Done | As a customer, I want to view an overview of my active and paused services per location, so that I can see what I'm subscribed to. |
| C-27 | Done | As a customer, I want to browse additional available services and subscribe mid-cycle, so that I can add services as my needs change. |
| C-28 | Done | As a customer, I want to view my collection history with dates, statuses, and driver names, so that I have a record of past service. |
| C-29 | Done | As a customer, I want to edit my location details (service type, HOA, gate code, notes), so that I can keep my information current. |
| C-30 | Done | As a customer, I want to manage notification preferences per location (collection reminders, schedule changes, driver updates, billing alerts), so that I control what communications I receive. |
| C-31 | Done | As a customer, I want to cancel all services for a location via a "Danger Zone" option, so that I can end service if I no longer need it. |

### 1.5 Multi-Location Management

| # | Status | User Story |
|---|--------|-----------|
| C-32 | Done | As a customer, I want to add multiple locations to my account, so that I can manage service for all my locations in one place. |
| C-33 | Done | As a customer, I want to see location cards with status badges (Active, On Hold, Canceled), so that I can quickly see the state of each location. |
| C-34 | Done | As a customer, I want to filter my locations by status, so that I can focus on active or problem locations. |
| C-35 | Done | As a customer, I want to delete a location that has no active subscriptions, so that I can clean up locations I no longer manage. |

### 1.6 Requests (On-Demand, Holds, Issues)

| # | Status | User Story |
|---|--------|-----------|
| C-36 | Done | As a customer, I want to request a one-time on-demand collection with date/time selection and notes, so that I can handle overflow waste outside my regular schedule. |
| C-37 | Done | As a customer, I want to upload photos of my waste and get an AI cost estimate, so that I know the approximate price before confirming. |
| C-38 | Done | As a customer, I want to reschedule or cancel a pending on-demand request, so that I can adjust if my plans change. |
| C-39 | Done | As a customer, I want to view my on-demand request history, so that I can track past and pending requests. |
| C-40 | Done | As a customer, I want to place a vacation hold on my subscriptions for a date range, so that I'm not billed while I'm away. |
| C-41 | Done | As a customer, I want my service to resume automatically at the end of a vacation hold, so that I don't have to remember to reactivate. |
| C-42 | Done | As a customer, I want to modify or cancel an active vacation hold, so that I can adjust if my travel plans change. |
| C-43 | Done | As a customer, I want to report a missed collection with a date, reason, and optional photo evidence, so that the issue is documented and resolved. |
| C-44 | Done | As a customer, I want to track the status of my missed collection report, so that I know when it's being investigated and resolved. |

### 1.7 Billing & Payments

| # | Status | User Story |
|---|--------|-----------|
| C-45 | Done | As a customer, I want to see a billing overview with total monthly cost, outstanding balance, and next billing date, so that I understand my financial obligations. |
| C-46 | Done | As a customer, I want to view and filter my invoices (Paid, Due, Overdue), so that I can find specific billing records. |
| C-47 | Done | As a customer, I want to download PDF invoices from Stripe, so that I have receipts for my records. |
| C-48 | Done | As a customer, I want to pay a specific outstanding invoice immediately, so that I can settle my balance on demand. |
| C-49 | Done | As a customer, I want to view my active, paused, and cancelled subscriptions with service name, frequency, and price, so that I understand what I'm paying for. |
| C-50 | Done | As a customer, I want to pause, resume, or cancel individual subscriptions, so that I have control over each service. |
| C-51 | Done | As a customer, I want to update the payment method on a specific subscription, so that I can use different cards for different services. |
| C-52 | Done | As a customer, I want to add a new credit card or bank account as a payment method, so that I can pay with my preferred method. |
| C-53 | Done | As a customer, I want to set a default payment method, so that new charges go to my preferred card or bank. |
| C-54 | Done | As a customer, I want to remove a saved payment method, so that I can clean up expired or unused cards. |
| C-55 | Done | As a customer, I want to toggle autopay on or off, so that I can choose between automatic and manual payments. |
| C-56 | Done | As a customer, I want to pay my outstanding balance from the dashboard via a quick-pay modal, so that I can resolve balances without navigating to the billing page. |

### 1.8 Account Settings

| # | Status | User Story |
|---|--------|-----------|
| C-57 | Done | As a customer, I want to edit my profile (name, email, phone), so that my contact information stays current. |
| C-58 | Done | As a customer, I want to change my password (current password required for email users; not required for Google OAuth users), so that I can maintain account security. |
| C-59 | Done | As a customer, I want to manage notification preferences with per-channel toggles (email, SMS) for each notification type, so that I only receive the communications I want. |

### 1.9 Referrals & Rewards

| # | Status | User Story |
|---|--------|-----------|
| C-60 | Done | As a customer, I want to view my unique referral code and shareable link, so that I can invite neighbors to the service. |
| C-61 | Done | As a customer, I want to copy my referral code or link to clipboard, so that I can easily share it. |
| C-62 | Done | As a customer, I want to see my total rewards earned and referral statuses (Pending, Completed), so that I can track the value of my referrals. |
| C-63 | Done | As a customer signing up with a referral code, I want the code auto-applied and both parties credited ($10 each), so that the referral benefit is seamless. |

### 1.10 Account Transfer

| # | Status | User Story |
|---|--------|-----------|
| C-64 | Done | As a customer, I want to initiate an account transfer by entering the new owner's name and email, so that I can hand off service when I move. |
| C-65 | Done | As a customer, I want to confirm the transfer by typing "TRANSFER", so that accidental transfers are prevented. |
| C-66 | Done | As a customer, I want to send a reminder or cancel a pending transfer, so that I can follow up or change my mind. |
| C-67 | Done | As a new owner, I want to accept a location transfer via an emailed token link, so that I can take over the account and subscriptions. |

### 1.11 AI Support Concierge

| # | Status | User Story |
|---|--------|-----------|
| C-68 | Done | As a customer, I want to chat with an AI assistant that knows my account, subscriptions, and invoices, so that I can get instant answers to billing and scheduling questions. |
| C-69 | Done | As a customer, I want quick-prompt buttons (Holiday Schedule, Pay Balance, Missed Collection), so that I can get common answers in one click. |
| C-70 | Done | As a customer, I want streamed real-time AI responses, so that I don't wait for the full response to load. |

### 1.12 Collection Feedback & Tips

| # | Status | User Story |
|---|--------|-----------|
| C-71 | Done | As a customer, I want to rate my driver and leave comments after a collection, so that I can provide feedback on service quality. |
| C-72 | Done | As a customer, I want to leave a tip for my driver after a successful collection, so that I can reward great service. |

### 1.13 Collection Intent

| # | Status | User Story |
|---|--------|-----------|
| C-73 | Done | As a customer, I want to mark an upcoming collection as "skip" or "out", so that my driver knows not to stop at my location this week. |

### 1.14 Collection Tracking

| # | Status | User Story |
|---|--------|-----------|
| C-74 | Done | As a customer, I want to see my next collection ETA via OptimoRoute integration, so that I know approximately when my driver will arrive. |
| C-75 | Done | As a customer, I want to see whether my collection is in-progress, so that I know the driver is on the way. |

### 1.15 Notifications & Payment Lifecycle

| # | Status | User Story |
|---|--------|-----------|
| C-76 | Done | As a customer, I want to receive an email confirmation when my payment is processed, so that I have proof of payment. |
| C-77 | Done | As a customer, I want to be alerted when a subscription payment fails, so that I can update my payment method before service is interrupted. |
| C-78 | Done | As a Google OAuth customer, I want to set a password without needing to enter a "current password" (since I don't have one), so that I can also log in with email/password. |
| C-79 | Partial | As a customer, I want the service signup wizard to save my progress so I can resume if I navigate away or reload, so that I don't lose my selections. <!-- Service selections saved via pending_service_selections table, but full wizard state (address/location steps) does not persist across page reload --> |
| C-80 | Partial | As a waitlisted customer, I want to be notified when a spot opens in my service area, so that I can activate service promptly. <!-- Zone approval flags locations and sends Slack alert to admins, but NO email/notification is sent to the customer. See S-15, A-93. --> |
| C-81 | Partial | As a customer, I want failed payments to be automatically retried before my service is suspended, so that a temporary card issue doesn't interrupt my collections. <!-- Stripe Smart Retries handle this, but no custom retry logic or grace-period UX exists in our code --> |
| C-82 | — | As a customer, I want to schedule equipment delivery when starting service, so that I have the right bins before my first collection. <!-- equipmentStatus field exists on locations but no scheduling UI implemented --> |

### 1.16 In-Portal Messaging

| # | Status | User Story |
|---|--------|-----------|
| C-83 | Done | As a customer, I want to message admin/dispatch via an in-portal chat widget with threaded conversations, so that I can get help without leaving the app. |
| C-84 | Done | As a customer, I want to see an unread message count badge on the chat widget, so that I know when I have new messages. |
| C-85 | Done | As a customer, I want to receive real-time messages via WebSocket, so that conversations feel instant. |

### 1.17 Mid-Cycle Service Changes

| # | Status | User Story |
|---|--------|-----------|
| C-86 | Done | As a customer, I want to change service quantities (add/remove units) mid-cycle from my Services tab, so that I can scale up or down without canceling. |
| C-87 | — | As a customer, I want to be prompted for equipment delivery/pickup when changing service quantities, so that I have the right bins for my updated plan. <!-- Quantity PATCH exists but no equipment logistics prompt in UI --> |

### 1.18 Location Lifecycle

| # | Status | User Story |
|---|--------|-----------|
| C-88 | Done | As a customer, I want orphaned location submissions (address submitted but no services selected) detected and surfaced with "Continue Setup" or "Remove" options, so that incomplete signups don't get stuck. |

### 1.19 In-App Notifications

| # | Status | User Story |
|---|--------|-----------|
| C-89 | Done | As a customer, I want to see an in-app notification bell with unread count, so that I'm aware of system notifications without relying solely on email/SMS. |

### 1.20 Process Gaps — Critical (trust-breaking or customer-blocking)

| # | Status | User Story |
|---|--------|-----------|
| C-90 | — | As a customer, I want to verify my email address via a confirmation link after registration, so that my account is secured and I receive important notifications at the right address. <!-- S-12 exists as a system story but there is no customer-facing flow defined --> |
| C-91 | — | As a customer, I want to escalate from the AI concierge to a human support agent when the AI can't resolve my issue, so that I'm never stuck without help. |
| C-92 | — | As a denied customer, I want to understand why my address was denied and know my options (re-apply, appeal, or join waitlist), so that I'm not left at a dead end after submitting my address. |
| C-93 | — | As a customer, I want to request deletion of my account and personal data, so that I can exercise my privacy rights. |
| C-94 | — | As a customer, I want to understand what happens when my payment fails (retry schedule, grace period, service suspension timeline), so that I know how long I have to fix my payment method before service stops. |

### 1.21 Process Gaps — High (experience-degrading)

| # | Status | User Story |
|---|--------|-----------|
| C-95 | — | As a customer, I want to receive a notification when my collection is complete, so that I know my bin was serviced without checking manually. |
| C-96 | — | As a customer, I want to view proof-of-service photos taken by my driver, so that I can verify the collection was done and resolve disputes. |
| C-97 | — | As a customer, I want to dispute a charge or request a billing adjustment through the portal, so that I can resolve billing issues without calling support. |
| C-98 | — | As a customer, I want to be proactively notified when my driver is running late or my route is delayed, so that I'm not left wondering where my service is. |
| C-99 | — | As a customer, I want to see holiday-adjusted collection dates in advance, so that I know when to put my bins out during holiday weeks. |
| C-100 | — | As a customer, I want to link or unlink Google SSO to my existing email/password account, so that I can choose my preferred login method without creating a new account. |

### 1.22 Process Gaps — Medium (nice-to-have improvements)

| # | Status | User Story |
|---|--------|-----------|
| C-101 | — | As a new customer, I want to receive a welcome email with onboarding steps after registration, so that I know what to do next. |
| C-102 | — | As a customer, I want to switch my service frequency (e.g., weekly to bi-weekly) without canceling and re-subscribing, so that plan changes are seamless. |
| C-103 | — | As a customer, I want to view an annual spending summary, so that I have a record for tax or budgeting purposes. |
| C-104 | — | As a customer, I want to grant a secondary user (spouse, roommate) read/manage access to my locations, so that my household can manage service without sharing credentials. |

### 1.23 Lifecycle Notifications

| # | Status | User Story |
|---|--------|-----------|
| C-105 | Done | As a customer, I want to be notified if my scheduled collection is cancelled, so that I know not to put my bins out. |
| C-106 | Done | As a customer, I want to be notified when my service is approved, denied, paused, or resumed, so that I know my current service state. |
| C-107 | Done | As a customer, I want confirmation when I pause or resume my subscription, so that I know the action was processed. |
| C-108 | Done | As a customer, I want to know when my missed collection report has been resolved, so that I know when to expect service. |
| C-109 | Done | As a customer, I want confirmation when my on-demand request is approved and assigned, so that I know it's being handled. |

---

## 2. ADMIN PORTAL

### 2.1 Authentication & Access Control

| # | User Story |
|---|-----------|
| A-1 | As an admin, I want to log in with my email and password, so that I can access the admin portal. |
| A-2 | As a full admin, I want to manage admin roles (full_admin, support, viewer), so that I can control who has access to what. |
| A-3 | As a full admin, I want to invite new admins via email with a token link, so that I can onboard team members securely. |
| A-4 | As an invited admin, I want to accept my invite and complete registration at `/admin/accept-invite`, so that I can join the admin team. |
| A-5 | As a full admin, I want to impersonate a customer or driver, so that I can see the portal from their perspective to debug issues. |
| A-6 | As a full admin, I want to stop impersonation and return to my admin session, so that I can switch back after troubleshooting. |

### 2.2 Dashboard & Analytics

| # | User Story |
|---|-----------|
| A-7 | As an admin, I want to see real-time stats (total users, locations, recent signups, active transfers, pending referrals, revenue, active subscriptions, open invoices), so that I have a business health snapshot. |
| A-8 | As an admin, I want to see an action bar with counts for missed collections, pending address reviews, and locations needing collection day assignment, so that I can address urgent items. |
| A-9 | As an admin, I want missed collections color-coded by age (red >72h, orange >24h, amber <24h), so that I can prioritize the most urgent issues. |
| A-10 | As an admin, I want to view signup analytics (daily/weekly line chart, configurable 30/60/90 days), so that I can track growth trends. |
| A-11 | As an admin, I want to view revenue analytics (monthly history, 6-12 months), so that I can monitor financial performance. |
| A-12 | As an admin, I want to view service breakdown analytics, so that I know which service types are most popular. |
| A-13 | As an admin, I want to see a real-time activity feed of customer actions, so that I know what's happening in the system. |
| A-14 | As an admin, I want sidebar badge counts that auto-refresh every 60 seconds, so that I'm always aware of pending items without manual refresh. |

### 2.3 Contacts (Customer & People Management)

| # | User Story |
|---|-----------|
| A-15 | As an admin, I want to search contacts by name, email, or phone, so that I can find specific users quickly. |
| A-16 | As an admin, I want to filter contacts by role (customer, driver, admin) and by pickup day status, so that I can narrow down to relevant people. |
| A-17 | As an admin, I want to sort contacts by newest, oldest, or alphabetical, so that I can organize the list as needed. |
| A-18 | As an admin, I want to select multiple contacts for bulk messaging, so that I can communicate with groups efficiently. |
| A-19 | As an admin, I want to view a person's full profile (name, email, phone, roles, status, joined date), so that I have complete information. |
| A-20 | As an admin, I want to edit a customer's name, email, and phone, so that I can correct or update their information. |
| A-21 | As a full admin, I want to delete a user, so that I can remove accounts that are no longer needed. |
| A-22 | As an admin, I want to view all locations owned by a customer with address, service type, status, collection day, zone, and monthly cost, so that I understand their full service profile. |
| A-23 | As an admin, I want to edit a location's collection day and frequency (manual or auto-detect), so that I can schedule their service. |
| A-24 | As an admin, I want to view a customer's activity timeline (location adds, orders, status changes, payments), so that I can understand their history. |
| A-25 | As an admin, I want to send email or SMS to a specific customer from their profile, so that I can communicate directly. |
| A-26 | As an admin, I want to add, edit, and delete internal notes on a customer (not visible to customer), so that I can track important context. |
| A-27 | As a full admin, I want to update a user's roles, so that I can grant or revoke admin/driver access. |

### 2.4 Operations — Calendar & Planning

| # | User Story |
|---|-----------|
| A-28 | As an admin, I want a monthly calendar showing daily collection counts by zone (color-coded), so that I can see workload distribution at a glance. |
| A-29 | As an admin, I want to click a day on the calendar to see detailed routes and collections, so that I can drill into daily operations. |
| A-30 | As an admin, I want a weekly planner with drag-drop management of collections across days, so that I can balance the weekly workload. |
| A-31 | As an admin, I want to auto-group locations into routes using OptimoRoute optimization, so that routes are geographically efficient. |
| A-32 | As an admin, I want to bulk-publish all routes for a week, so that drivers can start bidding on the full week at once. |
| A-33 | As an admin, I want to copy a week's plan to the next period, so that recurring schedules don't need to be rebuilt from scratch. |
| A-34 | As an admin, I want to run AI route optimization on a full week, so that the system auto-plans the most efficient routes. |

### 2.5 Operations — Route Management

| # | User Story |
|---|-----------|
| A-35 | As an admin, I want to create a route with a date, selected locations/stops, base pay, and max bid threshold, so that I can define work for drivers. |
| A-36 | As an admin, I want to edit draft routes (add/remove stops, change pay), so that I can refine routes before publishing. |
| A-37 | As an admin, I want to publish a route to change its status to "open" for driver bidding, so that drivers can see and bid on it. |
| A-38 | As an admin, I want to view all bids on a route with driver name, rating, bid amount vs. base pay, so that I can choose the best driver. |
| A-39 | As an admin, I want to accept a driver's bid to assign them the route, so that the work gets allocated. |
| A-40 | As an admin, I want to filter and search routes by driver, date, status, and type, so that I can find specific routes. |
| A-41 | As an admin, I want to sync routes to OptimoRoute for driver app delivery, so that drivers see their assignments in the field app. |
| A-42 | As an admin, I want to pull completion data from OptimoRoute after a route finishes, so that actual results are captured in the system. |
| A-43 | As an admin, I want to mark a route's payment status (paid/unpaid), so that I can track driver compensation. |
| A-101 | As an admin, I want routes completed in OptimoRoute to automatically show as completed in the portal when I select a date, so that I don't have to manually check OptimoRoute for status updates. |
| A-102 | As an admin, I want a warning when a driver completes a route with unfinished stops, so that I can follow up on skipped or failed collections. |
| A-103 | As an admin, I want to see proof-of-delivery data (photos, signatures, notes) from OptimoRoute on each completed stop, so that I can verify service was delivered. |
| A-104 | As an admin, I want to be alerted when an assigned route passes its scheduled time without being started, so that I can intervene. |
| A-105 | As an admin, I want drivers to be automatically notified when assigned a route, so that they don't miss new work. |
| A-106 | As an admin, I want all losing bidders to be notified when a bid is accepted, so that they can bid on other routes. |

### 2.6 Operations — Issues & Address Reviews

| # | User Story |
|---|-----------|
| A-44 | As an admin, I want to see all missed collections with age tracking and grouped by status, so that I can investigate and resolve them. |
| A-45 | As an admin, I want to resolve a missed collection by selecting a resolution status (investigating, resolved_customer_issue, resolved_system_issue, false_positive) and adding notes, so that the issue is documented and closed. |
| A-46 | As an admin, I want to see all locations pending address review with customer submission details, so that I can evaluate new service requests. |
| A-47 | As an admin, I want to check route feasibility for a pending address (via OptimoRoute), so that I know if the address can be served. |
| A-48 | As an admin, I want to get a route suggestion (zone/day) for a pending address, so that I know where to slot it into the schedule. |
| A-49 | As an admin, I want to approve, deny, or waitlist an address review with the customer automatically notified, so that the onboarding process moves forward. |
| A-50 | As an admin, I want to bulk approve or deny multiple address reviews at once, so that I can process backlogs efficiently. |
| A-107 | As an admin, I want the option to auto-create a redo stop when resolving a missed collection, so that the customer gets their service without manual route editing. |

### 2.7 Operations — Zones & Services

| # | User Story |
|---|-----------|
| A-51 | As an admin, I want to create, edit, and delete service zones, so that I can define geographic service areas. |
| A-52 | As an admin, I want to bulk-assign locations to a zone, so that I can organize locations geographically. |
| A-53 | As an admin, I want to create, edit, and delete on-demand service definitions (name, price), so that customers can request custom services. |
| A-54 | As an admin, I want to manage collection schedules (view all, edit collection day/frequency per location), so that each location has the right collection schedule. |
| A-88 | As an admin, I want to see all driver coverage zones in a read-only table with zone type (circle/polygon/ZIP), detail, color, and status, so that I can monitor driver territory coverage. |

### 2.8 Communications

| # | User Story |
|---|-----------|
| A-55 | As an admin, I want to view all message threads with customers and drivers in an inbox, so that I can manage conversations. |
| A-56 | As an admin, I want to read full conversation histories and reply to messages, so that I can communicate with users. |
| A-57 | As an admin, I want to create new conversations with a customer or driver, so that I can initiate outreach. |
| A-58 | As an admin, I want to mark conversations as read/unread and change their status (open/closed), so that I can manage my inbox. |
| A-59 | As an admin, I want to compose and send messages via email (Gmail API), SMS (Twilio), or in-app, so that I can reach users on their preferred channel. |
| A-60 | As an admin, I want to send bulk messages to multiple selected customers, so that I can communicate announcements efficiently. |
| A-61 | As an admin, I want to create and manage message templates with placeholder variables ({{customer_name}}, {{address}}, etc.), so that I can send consistent, personalized messages quickly. |
| A-62 | As an admin, I want to view an activity log of all sent communications (email, SMS, in-app) with delivery status, so that I can audit what was sent. |
| A-63 | As an admin, I want to schedule messages for future delivery and cancel scheduled messages, so that I can plan communications in advance. |
| A-64 | As an admin, I want to send custom notifications to individual users or in bulk, so that I can alert users about specific issues. |

### 2.9 Accounting & Billing

| # | User Story |
|---|-----------|
| A-65 | As an admin, I want to see KPI cards (30-day revenue, 30-day expenses, net income, outstanding A/R, active subscriptions, MRR), so that I have a financial overview. |
| A-66 | As an admin, I want to see a 6-month revenue vs. expenses chart, so that I can track financial trends. |
| A-67 | As an admin, I want to view a list of paid invoices with customer name, amount, date, and Stripe link, so that I can audit revenue. |
| A-68 | As an admin, I want to view all Stripe subscriptions (active, paused, cancelled) with customer and billing details, so that I can manage recurring revenue. |
| A-69 | As an admin, I want to view all invoices (paid, pending, failed) and send reminders for unpaid ones, so that I can manage accounts receivable. |
| A-70 | As an admin, I want to manually create an invoice for a customer, so that I can bill for ad-hoc services. |
| A-71 | As an admin, I want to apply a credit to a customer's account, so that I can issue refunds or promotional adjustments. |
| A-72 | As an admin, I want to cancel, pause, or resume a customer's subscription, so that I can manage their billing on their behalf. |
| A-73 | As an admin, I want to view a customer's full payment history, so that I can investigate billing issues. |
| A-74 | As an admin, I want to manage operational expenses (create, edit, delete) with categories, so that I can track business costs. |
| A-75 | As an admin, I want to view driver pay records with status (pending, paid) and mark them as paid, so that I can manage payroll. |

### 2.10 Settings & Configuration

| # | User Story |
|---|-----------|
| A-76 | As a full admin, I want to configure third-party integrations (Twilio, Stripe, Google OAuth, Gmail, Google Maps, Gemini AI, OptimoRoute) with test-connection buttons, so that the platform connects to external services. |
| A-77 | As a full admin, I want to authorize Gmail OAuth for sending emails, so that the system can send from the company email address. |
| A-78 | As a full admin, I want to manage the admin team (list admins, change roles, remove admins), so that I control platform access. |
| A-79 | As a full admin, I want to configure sync and automation settings (customer sync from Optimo, driver sync, collection day auto-detection), so that the system stays up to date. |
| A-80 | As an admin, I want to view a comprehensive audit log (who, what action, when, old/new values) with filters by admin, action, resource, and date range, so that I can track all admin activity. |
| A-81 | As a full admin, I want to view system error logs with severity, frequency, and status tracking, and trigger AI-powered fixes, so that I can monitor and maintain platform health. |
| A-82 | As a full admin, I want to configure the APP_DOMAIN and CORS settings, so that the platform works correctly in production. |

### 2.11 Global Features

| # | User Story |
|---|-----------|
| A-83 | As an admin, I want a global search across customers, locations, and drivers, so that I can find any record quickly. |
| A-84 | As an admin, I want to export customer data to CSV, so that I can analyze data offline or share with stakeholders. |

### 2.12 Invitations & Alerts

| # | User Story |
|---|-----------|
| A-85 | As an admin, I want to resend an expired or failed admin invitation, so that the invitee can still join. |
| A-86 | As an admin, I want to receive Slack alerts for critical system events (failed payments, missed pickups, errors), so that I can respond quickly without checking the portal. |
| A-87 | As an admin, I want the system to prevent duplicate location addresses for the same customer, so that accidental duplicate signups are blocked. |

### 2.13 AI Error Auto-Fix

| # | User Story |
|---|-----------|
| A-89 | As a full admin, I want to view error logs by date and source with severity and frequency, and trigger an AI-powered auto-fix (via Claude CLI) with optional context notes and flagged user stories, so that production errors can be diagnosed and patched quickly. |
| A-90 | As a full admin, I want to toggle a scheduled hourly auto-fix that automatically detects and fixes new errors, so that the platform self-heals without manual intervention. |
| A-91 | As a full admin, I want to view auto-fix history (git commits) in the Error Logs panel, so that I can audit what changes the AI made and when. |

### 2.14 Operations — Zone Approval & Claims

| # | User Story |
|---|-----------|
| A-92 | As an admin, I want to review driver-submitted coverage zones in a Zone Approval queue (approve/reject with notes), so that I control which areas drivers can serve. |
| A-93 | As an admin, I want waitlisted customers auto-flagged when a driver's zone is approved over their area, so that I can promptly activate their service. |
| A-94 | As an admin, I want to view and manage location-level driver claims (revoke claims, manually assign drivers), so that I have oversight of the dual dispatch model. |

### 2.15 Operations — On-Demand & Live Monitoring

| # | User Story |
|---|-----------|
| A-95 | As an admin, I want to manage on-demand collection requests (view, assign driver, set date, set price, update status), so that ad-hoc requests are fulfilled. |
| A-96 | As an admin, I want a real-time driver events panel, so that I can monitor live field activity. |
| A-97 | As an admin, I want to view route completion details (per-stop status, timing, photos), so that I can verify service quality. |
| A-108 | As an admin, I want to see which approved on-demand requests haven't been fulfilled within 5 days, so that I can follow up. |

### 2.16 Operations — Automation & Optimization

| # | User Story |
|---|-----------|
| A-98 | As an admin, I want collection day optimization (algorithm-based optimal day assignment using route insertion cost), so that new locations are slotted efficiently. |
| A-99 | As an admin, I want to configure auto-approve thresholds (distance/time) for address reviews, so that clearly feasible addresses are approved without manual review. |
| A-100 | As an admin, I want to impersonate a driver (in addition to customers), so that I can troubleshoot team portal issues from their perspective. |

### 2.17 Lifecycle Cascades

| # | User Story |
|---|-----------|
| A-109 | As an admin, I want cancelling a subscription to automatically remove that location from future routes and update its status, so that the planning view stays accurate. |
| A-110 | As an admin, I want pausing a subscription to hold that location's route stops, so that drivers don't visit paused addresses. Resume restores status. |
| A-111 | As an admin, when I deny or pause a location, I want its future route stops automatically cancelled, so that I don't have to clean them up manually. |
| A-112 | As an admin, I want a warning when a location has no collection day assigned, so that I can fix it before it silently fails to sync. |

### 2.18 Driver Management

| # | User Story |
|---|-----------|
| A-113 | As an admin, I want to suspend or reject a driver, so that non-compliant drivers can't access routes or bid on jobs. |
| A-114 | As an admin, I want new drivers to receive an invitation email when I create their profile, so that they know how to access the portal. |

---

## 3. TEAM/DRIVER PORTAL

### 3.1 Authentication & Onboarding

| # | User Story |
|---|-----------|
| T-1 | As a driver, I want to register with my email and password, so that I can create my driver account. |
| T-2 | As a driver, I want to sign in with Google SSO, so that I can access my account quickly. |
| T-3 | As a driver, I want to log in with my email and password, so that I can access the team portal. |
| T-4 | As a driver, I want to complete a W9 tax form (legal name, business name, tax classification, TIN, address, digital signature), so that the company has my tax information on file. |
| T-5 | As a driver, I want to update my W9 form after initial submission, so that I can correct mistakes or update information. |
| T-6 | As a driver, I want to set up direct deposit via Stripe Connect (automatic bank verification), so that I get paid quickly and securely. |
| T-7 | As a driver, I want to set up direct deposit manually (routing number, account number), so that I have an alternative if Stripe Connect doesn't work. |
| T-8 | As a driver, I want to skip direct deposit setup initially, so that I can complete other onboarding steps and set it up later. |
| T-9 | As a driver, I want to see my onboarding status (W9 complete, direct deposit complete, Stripe connected), so that I know what steps remain before I can start working. |

### 3.2 Dashboard

| # | User Story |
|---|-----------|
| T-10 | As a driver, I want to see a dashboard with my profile summary, rating, and job count, so that I have a quick overview of my performance. |
| T-11 | As a driver, I want to see counts of active routes and available routes for bidding, so that I know my current workload and opportunities. |
| T-12 | As a driver, I want onboarding status indicators on my dashboard, so that I'm reminded of incomplete steps. |

### 3.3 Route Bidding & Management

| # | User Story |
|---|-----------|
| T-13 | As a driver, I want to view all open/available routes with details (title, area, date, time, estimated stops/hours, base pay), so that I can decide which routes to bid on. |
| T-14 | As a driver, I want to filter available routes by date range, so that I can find routes that fit my schedule. |
| T-15 | As a driver, I want to place a bid on an available route with an optional message, so that I can compete for work. |
| T-16 | As a driver, I want to withdraw my bid before a route is assigned, so that I can change my mind. |
| T-17 | As a driver, I want to see my assigned routes (status: assigned, in_progress), so that I know what work I need to complete. |
| T-18 | As a driver, I want to mark a route as completed with optional notes, so that the system records my work. |
| T-19 | As a driver, I want my total jobs completed counter to update automatically on route completion, so that my profile stays accurate. |
| T-56 | As a driver, I want to decline a route assignment with a reason, so that I'm not forced into jobs I can't fulfill. |
| T-57 | As a driver, I want to know when my bid wasn't selected, so that I can bid on other routes. |
| T-58 | As a driver, I want to be notified when assigned a route, so that I don't miss new work. |
| T-59 | As a driver, I want to see available routes even if I haven't set up zones yet, so that I can start bidding immediately after onboarding. |

### 3.4 Schedule

| # | User Story |
|---|-----------|
| T-20 | As a driver, I want to see my schedule in a calendar view with color-coded route statuses (teal=assigned, yellow=in-progress, green=completed), so that I can visualize my upcoming work. |
| T-21 | As a driver, I want to toggle between calendar and list view, so that I can see my schedule in the format I prefer. |
| T-22 | As a driver, I want to navigate months and jump to today in the calendar, so that I can look ahead or return to the current date. |
| T-23 | As a driver, I want to complete routes inline from the schedule view, so that I can mark work done without extra navigation. |

### 3.5 Route Details

| # | User Story |
|---|-----------|
| T-24 | As a driver, I want to see full route details (all stops with addresses, customer names, sequence, duration, special notes), so that I can plan my route execution. |
| T-25 | As a driver, I want to see the base pay, actual pay, and payment status (unpaid/processing/paid) for completed routes, so that I can track my earnings. |

### 3.6 On-Demand Collections

| # | User Story |
|---|-----------|
| T-26 | As a driver, I want to view on-demand collection requests assigned to me (address, service, price, date, photos), so that I know what custom work I need to do. |
| T-27 | As a driver, I want to mark an on-demand collection as completed, so that the customer is notified and I get credit for the work. |

### 3.7 Messaging

| # | User Story |
|---|-----------|
| T-28 | As a driver, I want to see my conversations with dispatch/admin in an inbox, so that I can communicate about routes and issues. |
| T-29 | As a driver, I want to create a new conversation with a subject and message, so that I can reach out to dispatch when needed. |
| T-30 | As a driver, I want to send and receive messages in real-time via WebSocket, so that communication is instant. |
| T-31 | As a driver, I want to see an unread message count that updates automatically, so that I know when I have new messages. |
| T-32 | As a driver, I want to toggle email notifications for new messages on or off, so that I control how I'm alerted. |

### 3.8 Profile Management

| # | User Story |
|---|-----------|
| T-33 | As a driver, I want to view and edit my profile (name, phone), so that my information stays current. |
| T-34 | As a driver, I want to set my weekly availability schedule, so that dispatch knows when I'm available for routes. |
| T-35 | As a driver, I want to view my W9 data and bank account info (masked), so that I can verify what's on file. |
| T-36 | As a driver, I want to see my current rating and total jobs completed, so that I can track my performance. |

### 3.9 Earnings

| # | User Story |
|---|-----------|
| T-37 | As a driver, I want a dedicated earnings dashboard showing total earnings, pending payments, and payment history, so that I can track my income. |

### 3.10 Coverage Zones

| # | Status | User Story |
|---|--------|-----------|
| T-38 | Done | As a driver, I want to create circle coverage zones by clicking on the map and adjusting a radius slider, so that I can define round service areas quickly. |
| T-39 | Done | As a driver, I want to draw freeform polygon coverage zones on the map, so that I can define precise, irregular service boundaries. |
| T-40 | Done | As a driver, I want to enter a ZIP code and have the zone boundary auto-generated from Census data, so that I can claim an entire postal area without manual drawing. |
| T-41 | Done | As a driver, I want ZIP+4 input to fall back to the 5-digit ZIP boundary with an info notice, so that I understand the boundary shown and can refine it. |
| T-42 | Done | As a driver, I want to add multiple ZIP codes and merge them into a single named zone, so that I can cover adjacent postal areas as one zone. |
| T-43 | Done | As a driver, I want to drag my circle zones to reposition them on the map, so that I can adjust coverage without deleting and recreating. |
| T-44 | Done | As a driver, I want to drag polygon vertices to reshape my polygon zones, so that I can fine-tune my coverage boundaries. |
| T-45 | Done | As a driver, I want to toggle an edit mode that enables dragging and reshaping all my zones at once, so that I can quickly adjust multiple zones. |
| T-46 | Done | As a driver, I want to name, color-code, pause, and delete my coverage zones, so that I can organize and manage my territory. |

### 3.11 Location Claiming & Unified Coverage

| # | Status | User Story |
|---|--------|-----------|
| T-47 | Done | As a driver, I want to see all available locations within my coverage zones on the same map as my zones, so that I have a unified view of territory and opportunities. |
| T-48 | Done | As a driver, I want to claim unclaimed locations as ongoing territory, so that I have consistent collection assignments. |
| T-49 | Done | As a driver, I want to release locations I've previously claimed, so that I can adjust my workload. |
| T-50 | Done | As a driver, I want to see which locations are claimed by other drivers (with their name), so that I know what's already taken. |
| T-51 | Done | As a driver, I want a tabbed panel (My Zones / Available / My Claimed) below the map, so that I can switch between managing zones and managing locations in one view. |
| T-52 | Done | As a driver, I want a map legend showing unclaimed (green), my claim (blue), and other driver (orange) markers, so that I can visually distinguish location statuses. |

### 3.12 Zone Approval & Claim Conflicts

| # | Status | User Story |
|---|--------|-----------|
| T-53 | Done | As a driver, I want my coverage zones to go through an approval workflow (pending → active/rejected), so that I understand my zone status and know when I can start working an area. |
| T-54 | Done | As a driver, I want to see zone approval status indicators (pending, active, rejected) on my zone cards, so that I know which zones are live. |
| T-55 | Done | As a driver, I want claim conflict resolution based on driver rating (higher-rated driver wins), so that the best-performing drivers get priority on locations. |

---

## 4. PROVIDER PORTAL

> **Audit summary (2026-03-10):** 54 stories. Done: 43 | Partial: 3 (P-12, P-42, P-53) | Not started: 8 (P-15, P-16, P-46, P-47, P-48, P-50, P-51, P-52).

### 4.1 Authentication & Registration

| # | Status | User Story |
|---|--------|-----------|
| P-1 | Done | As a hauling company owner, I want to register with my company name, email, phone, and password, so that I can create a provider account on the platform. |
| P-2 | Done | As a hauling company owner, I want to sign up with Google SSO, so that I can register without creating a new password. |
| P-3 | Done | As a provider owner, I want to log in with my email and password, so that I can access the provider portal. |
| P-4 | Done | As a provider owner, I want to log in with Google SSO, so that I can access the portal quickly. |
| P-5 | Done | As a provider owner, I want to be automatically routed to `/provider` after login, so that I land in the correct portal and not the driver portal. |
| P-6 | Done | As a provider owner, I want to be redirected to `/provider` after Google OAuth completes, so that the OAuth flow lands me in the right place. |

### 4.2 Onboarding Wizard

| # | Status | User Story |
|---|--------|-----------|
| P-7 | Done | As a new provider owner (approval status: draft), I want to see the onboarding wizard when I visit `/provider`, so that I can complete my application before accessing the portal. |
| P-8 | Done | As a provider owner, I want my onboarding progress saved after each step, so that I can leave and resume without losing data. |
| P-9 | Done | As a provider owner, I want to fill in my business information (business type, EIN, contact phone/email, website, description, solo operator flag) in step 1, so that the platform knows who I am. |
| P-10 | Done | As a provider owner, I want a unique URL slug generated from my company name when I complete step 1, so that my public join page is accessible immediately after approval. |
| P-11 | Done | As a provider owner who registered via Google OAuth, I want my slug generated when I provide my company name in step 1 (not at registration), so that Google OAuth providers get a slug too. |
| P-12 | Partial | As a provider owner, I want to upload my certificate of insurance (PDF/image, max 10 MB) and enter my license number and expiry date in step 2, so that the platform can verify my compliance. <!-- Upload works; no virus/format validation beyond mime type --> |
| P-13 | Done | As a provider owner, I want to enter the ZIP codes I serve in step 3, so that the platform knows my coverage area. |
| P-14 | Done | As a provider owner, I want to connect my bank account via Stripe Express in step 4, so that I can receive payments for completed routes. |
| P-15 | — | As a provider owner, I want to skip Stripe Connect and complete it later from my profile, so that I'm not blocked from submitting if I don't have banking details ready. |
| P-16 | — | As a provider owner, I want a progress indicator showing which step I'm on and how many remain, so that I know how close I am to completion. |
| P-17 | Done | As a provider owner, I want to review a summary of all my submitted information in step 5, so that I can confirm everything is correct before submitting. |
| P-18 | Done | As a provider owner, I want to submit my completed application for admin review, so that my account can be approved. |

### 4.3 Application Status Gating

| # | Status | User Story |
|---|--------|-----------|
| P-19 | Done | As a provider owner whose application is pending review, I want to see an "Application Under Review" screen at `/provider`, so that I know my submission was received and I can't access the portal yet. |
| P-20 | Done | As a provider owner whose application was rejected, I want to see a "Not Approved" screen with the admin's rejection notes, so that I understand why and can contact support. |
| P-21 | Done | As a provider owner whose account is suspended, I want to see a "Suspended" screen with the reason, so that I know what happened. |
| P-22 | Done | As an approved provider owner, I want the full provider portal to unlock automatically, so that I can start using all features after approval without any extra steps. |

### 4.4 Overview Tab

| # | Status | User Story |
|---|--------|-----------|
| P-23 | Done | As an approved provider owner, I want to see a dashboard with summary stats (active members, vehicles, routes this month, 30-day revenue), so that I have a quick snapshot of my operation. |
| P-24 | Done | As a provider owner, I want to see my public join page URL on the Overview tab, so that I can share it with drivers and customers. |
| P-25 | Done | As a provider owner, I want a Getting Started checklist on the Overview tab with links to other tabs, so that I know what to set up after approval. |

### 4.5 Team Management

| # | Status | User Story |
|---|--------|-----------|
| P-26 | Done | As a provider owner, I want to view all team members with their role, employment type (contractor/employee), and status (active/suspended), so that I have a full roster view. |
| P-27 | Done | As a provider owner, I want to invite a driver by email (with name, phone, role, and employment type), so that they receive an invitation link to join my team. |
| P-28 | Done | As a provider owner, I want to bulk-invite multiple drivers by pasting a list of emails, so that I can onboard large teams quickly. |
| P-29 | Done | As a provider owner, I want to view pending invitations and revoke them before they're accepted, so that I can manage who joins. |
| P-30 | Done | As a provider owner, I want to set or update a team member's OptimoRoute driver ID, so that they can be assigned routes via the dispatch integration. |
| P-31 | Done | As a provider owner, I want to change a team member's role, so that I can promote or reassign responsibilities. |
| P-32 | Done | As a provider owner, I want to remove a team member from my company, so that former employees no longer have access. |

### 4.6 Client Management

| # | Status | User Story |
|---|--------|-----------|
| P-33 | Done | As a provider owner, I want to invite individual customers by entering their name, email, phone, address, container size, and collection frequency, so that I can register existing customers on the platform. |
| P-34 | Done | As a provider owner, I want to bulk-import clients by pasting a CSV or list of emails with shared settings, so that I can migrate large customer lists efficiently. |
| P-35 | Done | As a provider owner, I want to see all pending client invitations with their status (pending/sent/registered), so that I know who has accepted and who hasn't. |
| P-36 | Done | As a provider owner, I want to resend an expired client invitation, so that customers who didn't register in time can try again. |
| P-37 | Done | As a provider owner, I want to see all registered customers linked to my company (name, email, address, can size, collection day, service status), so that I have a full client view. |

### 4.7 Fleet Management

| # | Status | User Story |
|---|--------|-----------|
| P-38 | Done | As a provider owner, I want to add vehicles to my fleet with make, model, year, type, ownership, status, VIN, license plate, DOT number, registration expiry, and last inspection date, so that my equipment is tracked. |
| P-39 | Done | As a provider owner, I want to edit vehicle details, so that I can keep records current. |
| P-40 | Done | As a provider owner, I want to remove a vehicle from my fleet, so that decommissioned equipment is no longer listed. |
| P-41 | Done | As a provider owner, I want compliance badges on vehicles warning me when registration expires within 30 days or inspection is overdue by more than a year, so that I can stay compliant. |
| P-42 | Partial | As a provider owner, I want automated email/SMS alerts when a vehicle's registration or inspection is about to expire, so that I don't miss a deadline. <!-- Badge UI done; automated reminders not implemented --> |

### 4.8 Roles & Permissions

| # | Status | User Story |
|---|--------|-----------|
| P-43 | Done | As a provider owner, I want to see pre-defined roles (Owner with full access, Default Driver with route execution rights), so that I have sensible defaults without any setup. |
| P-44 | Done | As a provider owner, I want to create custom roles (e.g., Dispatcher, Accountant) with a specific set of permissions, so that I can give team members exactly the access they need. |
| P-45 | Done | As a provider owner, I want to update the permissions on any custom role, so that I can adjust access as my team evolves. |
| P-46 | — | As a provider owner, I want to delete a custom role (and choose what to do with members currently holding it), so that I can clean up unused roles. |
| P-47 | — | As a provider team member, I want to see only the portal tabs I have permission to access, so that my view reflects my actual role. |

### 4.9 Dispatch

| # | Status | User Story |
|---|--------|-----------|
| P-48 | Done | As a provider owner or dispatcher, I want to see available routes offered to my company with details (name, date, stop count, per-stop rate), so that I can decide which to accept. |
| P-49 | Done | As a provider owner or dispatcher, I want to assign a driver and vehicle to a route and dispatch it, so that my team knows what to do and OptimoRoute is updated. |
| P-50 | Done | As a provider owner or dispatcher, I want to recall a dispatched route assignment, so that I can reassign it to a different driver or vehicle. |
| P-51 | Done | As a provider owner or dispatcher, I want to decline a route with a reason, so that the admin knows my company can't fulfil it. |
| P-52 | — | As a driver on a provider team, I want to see only routes assigned to me (not the full provider dispatch view), so that my view isn't cluttered with routes meant for others. |

### 4.10 Accounting

| # | Status | User Story |
|---|--------|-----------|
| P-53 | Partial | As a provider owner, I want to see financial summaries (total revenue, routes completed, average revenue per route, pending payments) for selectable time periods, so that I can track my business performance. <!-- Summary API done; payment settlement not yet wired --> |
| P-54 | Done | As a provider owner, I want a per-route payment breakdown showing route name, zone, date, stop count, per-stop rate, total, and payment status, so that I can verify what I've been paid. |
| P-55 | Done | As a provider owner, I want revenue and route breakdowns by driver, so that I can see each team member's contribution. |
| P-56 | Done | As a provider owner, I want revenue and route breakdowns by vehicle, so that I can assess fleet utilization. |
| P-57 | — | As a provider owner, I want to export accounting data as CSV for a selected period, so that I can use it in my own accounting tools. |

### 4.11 Public Join Page

| # | Status | User Story |
|---|--------|-----------|
| P-58 | Done | As a provider owner, I want a public join page at `/join/:slug` that shows my company name, description, and CTAs for drivers and customers, so that I can recruit directly. |
| P-59 | Done | As a prospective driver, I want to visit a provider's join page and be taken to driver registration pre-linked to that company, so that I join the right team. |
| P-60 | Done | As a prospective customer, I want to visit a provider's join page and be taken to customer registration pre-linked to that provider, so that my service is set up under them. |

---

## 5. CROSS-CUTTING / SYSTEM STORIES

| # | User Story |
|---|-----------|
| S-1 | As the system, I want to create a Stripe customer record on user registration, so that billing is ready from the start. |
| S-2 | As the system, I want to detect orphaned Stripe subscriptions on login and reconcile them, so that billing stays consistent. |
| S-3 | As the system, I want to send email notifications for address review decisions, missed collection resolutions, and account transfers, so that users stay informed. |
| S-4 | As the system, I want to log all admin actions to an immutable audit log, so that there's a complete trail of administrative activity. |
| S-5 | As the system, I want to auto-create driver pay expense records on route completion, so that payroll tracking is automatic. |
| S-6 | As the system, I want to enforce a max of 50 stops per route, so that routes stay manageable for drivers. |
| S-7 | As the system, I want to gate driver access to routes/schedule behind completed onboarding, so that only verified drivers can work. |
| S-8 | As the system, I want to use WebSocket connections for real-time message delivery, so that conversations feel instant. |
| S-9 | As the system, I want session persistence via PostgreSQL with explicit `session.save()`, so that sessions survive across async operations. |
| S-10 | As the system, I want to send a payment confirmation email after each successful invoice payment, so that customers have a receipt. |
| S-11 | As the system, I want to send an alert email when a subscription payment fails, so that customers can fix their payment method. |
| S-12 | As the system, I want to verify email addresses on registration via a confirmation link, so that only valid emails are in the system. <!-- Customer-facing story: C-90 --> |
| S-13 | As the system, I want to log client-side errors (rate-limited) to NDJSON log files by date, so that frontend issues are captured for diagnosis. |
| S-14 | As the system, I want to send Slack notifications on zone approval/rejection decisions and waitlist auto-flagging, so that admins are alerted to coverage changes. |
| S-15 | As the system, I want subscription cancel/pause to cascade to location status and future route stops, so that planning data stays clean automatically. |
| S-16 | As the system, I want location status changes (denied/paused/cancelled) to cancel all future pending route stops for that location, so that drivers don't visit inactive addresses. |
| S-17 | As the system, I want to block suspended and rejected drivers from all team portal endpoints, so that non-compliant drivers can't access routes or bid. |
| S-18 | As the system, I want to send lifecycle notification emails (route cancel, status change, pause/resume, missed resolution, on-demand approval) to affected customers, so that they stay informed of service changes. |
| S-15 | As the system, I want zone approval to trigger automatic waitlist re-evaluation for customers in the approved area, so that waitlisted customers are activated as coverage expands. <!-- Flags locations + Slack alert to admins, but NO customer notification yet. See C-80. --> |
