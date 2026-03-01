# User Stories — Rural Waste Management Portal

Complete inventory of user stories across all three portals (Customer, Admin, Team/Driver), derived from a full codebase audit. Each story follows the format: **As a [role], I want to [action], so that [benefit].**

**Status key:** Done = fully implemented | Partial = partially implemented | — = not yet started

---

## 1. CUSTOMER PORTAL

### 1.1 Authentication & Account

| # | User Story |
|---|-----------|
| C-1 | As a customer, I want to register with my email and password, so that I can create an account and start service. |
| C-2 | As a customer, I want to sign up with Google SSO, so that I can register without creating a new password. |
| C-3 | As a customer, I want to log in with my email and password, so that I can access my account. |
| C-4 | As a customer, I want to log in with Google SSO, so that I can access my account quickly. |
| C-5 | As a customer, I want to be locked out after 5 failed login attempts (15-min cooldown), so that my account is protected from brute-force attacks. |
| C-6 | As a customer, I want to request a password reset email, so that I can regain access if I forget my password. |
| C-7 | As a customer, I want to reset my password via a time-limited token (1 hour), so that the reset link can't be reused indefinitely. |
| C-8 | As a customer, I want to log out and have my session destroyed, so that nobody else can access my account on a shared device. |

### 1.2 Dashboard

| # | User Story |
|---|-----------|
| C-9 | As a customer, I want to see a dashboard with quick actions (Start Service, Pay Balance, Extra Pickup, Report Issue, Manage Plan, Referral), so that I can navigate to common tasks in one click. |
| C-10 | As a customer, I want to see my upcoming collection dates per property, so that I know when to put my bins out. |
| C-11 | As a customer, I want to see my total monthly cost and outstanding balance at a glance, so that I stay informed about my billing. |
| C-12 | As a customer, I want to see payment alerts for past-due subscriptions, so that I can pay before service is interrupted. |
| C-13 | As a customer, I want to be prompted to tip my driver after a successful collection, so that I can show appreciation for good service. |
| C-14 | As a customer, I want to dismiss the tip prompt and not see it again for that pickup, so that I'm not nagged repeatedly. |
| C-15 | As a customer, I want to see an AI Concierge card on my dashboard, so that I can quickly access support. |
| C-16 | As a customer with multiple properties, I want to switch between properties or view "All" aggregated data, so that I can manage everything from one dashboard. |

### 1.3 Service Setup & Onboarding

| # | Status | User Story |
|---|--------|-----------|
| C-17 | Done | As a customer, I want to enter my address and have it validated against the service area, so that I know upfront if service is available. |
| C-18 | Done | As a customer, I want to use address autocomplete (Google Maps), so that I can enter my address quickly and accurately. |
| C-19 | Done | As a customer, I want to specify my property type (personal, commercial, short-term, rental, other), so that the system can recommend appropriate services. |
| C-20 | Done | As a customer, I want to provide property details (HOA status, community name, gate code, service notes), so that drivers can access my property and follow any special instructions. |
| C-21 | Done | As a customer, I want to browse and select from available services with pricing by frequency (weekly, bi-weekly, monthly, one-time), so that I can choose the plan that fits my needs. |
| C-22 | Done | As a customer, I want to get AI-based service recommendations from uploaded photos of my waste, so that I select the right service size. |
| C-23 | Done | As a customer, I want to add a payment method (card or bank account) via Stripe during signup, so that billing is set up before my first pickup. |
| C-24 | Done | As a customer, I want my property to enter a "pending review" state after submission, so that an admin can verify serviceability before I'm charged. |
| C-25 | Done | As a customer, I want to be notified when my address is approved, denied, or waitlisted, so that I know the status of my service request. |

### 1.4 Service Management

| # | User Story |
|---|-----------|
| C-26 | As a customer, I want to view an overview of my active and paused services per property, so that I can see what I'm subscribed to. |
| C-27 | As a customer, I want to browse additional available services and subscribe mid-cycle, so that I can add services as my needs change. |
| C-28 | As a customer, I want to view my collection history with dates, statuses, and driver names, so that I have a record of past service. |
| C-29 | As a customer, I want to edit my property details (service type, HOA, gate code, notes), so that I can keep my information current. |
| C-30 | As a customer, I want to manage notification preferences per property (pickup reminders, schedule changes, driver updates, billing alerts), so that I control what communications I receive. |
| C-31 | As a customer, I want to cancel all services for a property via a "Danger Zone" option, so that I can end service if I no longer need it. |

### 1.5 Multi-Property Management

| # | User Story |
|---|-----------|
| C-32 | As a customer, I want to add multiple properties to my account, so that I can manage service for all my locations in one place. |
| C-33 | As a customer, I want to see property cards with status badges (Active, On Hold, Canceled), so that I can quickly see the state of each property. |
| C-34 | As a customer, I want to filter my properties by status, so that I can focus on active or problem properties. |
| C-35 | As a customer, I want to delete a property that has no active subscriptions, so that I can clean up locations I no longer manage. |

### 1.6 Special Requests

| # | User Story |
|---|-----------|
| C-36 | As a customer, I want to request a one-time extra pickup with date/time selection and notes, so that I can handle overflow waste outside my regular schedule. |
| C-37 | As a customer, I want to upload photos of my extra waste and get an AI cost estimate, so that I know the approximate price before confirming. |
| C-38 | As a customer, I want to reschedule or cancel a pending extra pickup request, so that I can adjust if my plans change. |
| C-39 | As a customer, I want to view my special pickup request history, so that I can track past and pending requests. |
| C-40 | As a customer, I want to place a vacation hold on my subscriptions for a date range, so that I'm not billed while I'm away. |
| C-41 | As a customer, I want my service to resume automatically at the end of a vacation hold, so that I don't have to remember to reactivate. |
| C-42 | As a customer, I want to modify or cancel an active vacation hold, so that I can adjust if my travel plans change. |
| C-43 | As a customer, I want to report a missed pickup with a date, reason, and optional photo evidence, so that the issue is documented and resolved. |
| C-44 | As a customer, I want to track the status of my missed pickup report, so that I know when it's being investigated and resolved. |

### 1.7 Billing & Payments

| # | User Story |
|---|-----------|
| C-45 | As a customer, I want to see a billing overview with total monthly cost, outstanding balance, and next billing date, so that I understand my financial obligations. |
| C-46 | As a customer, I want to view and filter my invoices (Paid, Due, Overdue), so that I can find specific billing records. |
| C-47 | As a customer, I want to download PDF invoices from Stripe, so that I have receipts for my records. |
| C-48 | As a customer, I want to pay a specific outstanding invoice immediately, so that I can settle my balance on demand. |
| C-49 | As a customer, I want to view my active, paused, and cancelled subscriptions with service name, frequency, and price, so that I understand what I'm paying for. |
| C-50 | As a customer, I want to pause, resume, or cancel individual subscriptions, so that I have control over each service. |
| C-51 | As a customer, I want to update the payment method on a specific subscription, so that I can use different cards for different services. |
| C-52 | As a customer, I want to add a new credit card or bank account as a payment method, so that I can pay with my preferred method. |
| C-53 | As a customer, I want to set a default payment method, so that new charges go to my preferred card or bank. |
| C-54 | As a customer, I want to remove a saved payment method, so that I can clean up expired or unused cards. |
| C-55 | As a customer, I want to toggle autopay on or off, so that I can choose between automatic and manual payments. |
| C-56 | As a customer, I want to pay my outstanding balance from the dashboard via a quick-pay modal, so that I can resolve balances without navigating to the billing page. |

### 1.8 Account Settings

| # | User Story |
|---|-----------|
| C-57 | As a customer, I want to edit my profile (name, email, phone), so that my contact information stays current. |
| C-58 | As a customer, I want to change my password (current password required for email users; not required for Google OAuth users), so that I can maintain account security. |
| C-59 | As a customer, I want to manage notification preferences with per-channel toggles (email, SMS) for each notification type, so that I only receive the communications I want. |

### 1.9 Referrals & Rewards

| # | User Story |
|---|-----------|
| C-60 | As a customer, I want to view my unique referral code and shareable link, so that I can invite neighbors to the service. |
| C-61 | As a customer, I want to copy my referral code or link to clipboard, so that I can easily share it. |
| C-62 | As a customer, I want to see my total rewards earned and referral statuses (Pending, Completed), so that I can track the value of my referrals. |
| C-63 | As a customer signing up with a referral code, I want the code auto-applied and both parties credited ($10 each), so that the referral benefit is seamless. |

### 1.10 Account Transfer

| # | User Story |
|---|-----------|
| C-64 | As a customer, I want to initiate an account transfer by entering the new owner's name and email, so that I can hand off service when I move. |
| C-65 | As a customer, I want to confirm the transfer by typing "TRANSFER", so that accidental transfers are prevented. |
| C-66 | As a customer, I want to send a reminder or cancel a pending transfer, so that I can follow up or change my mind. |
| C-67 | As a new owner, I want to accept a property transfer via an emailed token link, so that I can take over the account and subscriptions. |

### 1.11 AI Support Concierge

| # | User Story |
|---|-----------|
| C-68 | As a customer, I want to chat with an AI assistant that knows my account, subscriptions, and invoices, so that I can get instant answers to billing and scheduling questions. |
| C-69 | As a customer, I want quick-prompt buttons (Holiday Schedule, Pay Balance, Missed Collection), so that I can get common answers in one click. |
| C-70 | As a customer, I want streamed real-time AI responses, so that I don't wait for the full response to load. |

### 1.12 Collection Feedback & Tips

| # | User Story |
|---|-----------|
| C-71 | As a customer, I want to rate my driver and leave comments after a pickup, so that I can provide feedback on service quality. |
| C-72 | As a customer, I want to leave a tip for my driver after a successful collection, so that I can reward great service. |

### 1.13 Collection Intent

| # | User Story |
|---|-----------|
| C-73 | As a customer, I want to mark an upcoming pickup as "skip" or "out", so that my driver knows not to stop at my property this week. |

### 1.14 Pickup Tracking

| # | User Story |
|---|-----------|
| C-74 | As a customer, I want to see my next pickup ETA via OptimoRoute integration, so that I know approximately when my driver will arrive. |
| C-75 | As a customer, I want to see whether my pickup is in-progress, so that I know the driver is on the way. |

### 1.15 Notifications & Payment Lifecycle

| # | User Story |
|---|-----------|
| C-76 | As a customer, I want to receive an email confirmation when my payment is processed, so that I have proof of payment. |
| C-77 | As a customer, I want to be alerted when a subscription payment fails, so that I can update my payment method before service is interrupted. |
| C-78 | As a Google OAuth customer, I want to set a password without needing to enter a "current password" (since I don't have one), so that I can also log in with email/password. |
| C-79 | As a customer, I want the service signup wizard to save my progress so I can resume if I navigate away or reload, so that I don't lose my selections. |
| C-80 | As a waitlisted customer, I want to be notified when a spot opens in my service area, so that I can activate service promptly. |
| C-81 | As a customer, I want failed payments to be automatically retried before my service is suspended, so that a temporary card issue doesn't interrupt my pickups. |
| C-82 | As a customer, I want to schedule equipment delivery when starting service, so that I have the right bins before my first pickup. |

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
| A-7 | As an admin, I want to see real-time stats (total users, properties, recent signups, active transfers, pending referrals, revenue, active subscriptions, open invoices), so that I have a business health snapshot. |
| A-8 | As an admin, I want to see an action bar with counts for missed pickups, pending address reviews, and properties needing pickup day assignment, so that I can address urgent items. |
| A-9 | As an admin, I want missed pickups color-coded by age (red >72h, orange >24h, amber <24h), so that I can prioritize the most urgent issues. |
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
| A-22 | As an admin, I want to view all properties owned by a customer with address, service type, status, pickup day, zone, and monthly cost, so that I understand their full service profile. |
| A-23 | As an admin, I want to edit a property's pickup day and frequency (manual or auto-detect), so that I can schedule their service. |
| A-24 | As an admin, I want to view a customer's activity timeline (property adds, orders, status changes, payments), so that I can understand their history. |
| A-25 | As an admin, I want to send email or SMS to a specific customer from their profile, so that I can communicate directly. |
| A-26 | As an admin, I want to add, edit, and delete internal notes on a customer (not visible to customer), so that I can track important context. |
| A-27 | As a full admin, I want to update a user's roles, so that I can grant or revoke admin/driver access. |

### 2.4 Operations — Calendar & Planning

| # | User Story |
|---|-----------|
| A-28 | As an admin, I want a monthly calendar showing daily pickup counts by zone (color-coded), so that I can see workload distribution at a glance. |
| A-29 | As an admin, I want to click a day on the calendar to see detailed routes and pickups, so that I can drill into daily operations. |
| A-30 | As an admin, I want a weekly planner with drag-drop management of pickups across days, so that I can balance the weekly workload. |
| A-31 | As an admin, I want to auto-group properties into routes using OptimoRoute optimization, so that routes are geographically efficient. |
| A-32 | As an admin, I want to bulk-publish all routes for a week, so that drivers can start bidding on the full week at once. |
| A-33 | As an admin, I want to copy a week's plan to the next period, so that recurring schedules don't need to be rebuilt from scratch. |
| A-34 | As an admin, I want to run AI route optimization on a full week, so that the system auto-plans the most efficient routes. |

### 2.5 Operations — Route Management

| # | User Story |
|---|-----------|
| A-35 | As an admin, I want to create a route with a date, selected properties/stops, base pay, and max bid threshold, so that I can define work for drivers. |
| A-36 | As an admin, I want to edit draft routes (add/remove stops, change pay), so that I can refine routes before publishing. |
| A-37 | As an admin, I want to publish a route to change its status to "open" for driver bidding, so that drivers can see and bid on it. |
| A-38 | As an admin, I want to view all bids on a route with driver name, rating, bid amount vs. base pay, so that I can choose the best driver. |
| A-39 | As an admin, I want to accept a driver's bid to assign them the route, so that the work gets allocated. |
| A-40 | As an admin, I want to filter and search routes by driver, date, status, and type, so that I can find specific routes. |
| A-41 | As an admin, I want to sync routes to OptimoRoute for driver app delivery, so that drivers see their assignments in the field app. |
| A-42 | As an admin, I want to pull completion data from OptimoRoute after a route finishes, so that actual results are captured in the system. |
| A-43 | As an admin, I want to mark a route's payment status (paid/unpaid), so that I can track driver compensation. |

### 2.6 Operations — Issues & Address Reviews

| # | User Story |
|---|-----------|
| A-44 | As an admin, I want to see all missed pickups with age tracking and grouped by status, so that I can investigate and resolve them. |
| A-45 | As an admin, I want to resolve a missed pickup by selecting a resolution status (investigating, resolved_customer_issue, resolved_system_issue, false_positive) and adding notes, so that the issue is documented and closed. |
| A-46 | As an admin, I want to see all properties pending address review with customer submission details, so that I can evaluate new service requests. |
| A-47 | As an admin, I want to check route feasibility for a pending address (via OptimoRoute), so that I know if the address can be served. |
| A-48 | As an admin, I want to get a route suggestion (zone/day) for a pending address, so that I know where to slot it into the schedule. |
| A-49 | As an admin, I want to approve, deny, or waitlist an address review with the customer automatically notified, so that the onboarding process moves forward. |
| A-50 | As an admin, I want to bulk approve or deny multiple address reviews at once, so that I can process backlogs efficiently. |

### 2.7 Operations — Zones & Services

| # | User Story |
|---|-----------|
| A-51 | As an admin, I want to create, edit, and delete service zones, so that I can define geographic service areas. |
| A-52 | As an admin, I want to bulk-assign properties to a zone, so that I can organize properties geographically. |
| A-53 | As an admin, I want to create, edit, and delete special pickup service definitions (name, price), so that customers can request custom services. |
| A-54 | As an admin, I want to manage pickup schedules (view all, edit pickup day/frequency per property), so that each property has the right collection schedule. |

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
| A-79 | As a full admin, I want to configure sync and automation settings (customer sync from Optimo, driver sync, pickup day auto-detection), so that the system stays up to date. |
| A-80 | As an admin, I want to view a comprehensive audit log (who, what action, when, old/new values) with filters by admin, action, resource, and date range, so that I can track all admin activity. |
| A-81 | As a full admin, I want to view system error logs with severity, frequency, and status tracking, so that I can monitor platform health. |
| A-82 | As a full admin, I want to configure the APP_DOMAIN and CORS settings, so that the platform works correctly in production. |

### 2.11 Global Features

| # | User Story |
|---|-----------|
| A-83 | As an admin, I want a global search across customers, properties, and drivers, so that I can find any record quickly. |
| A-84 | As an admin, I want to export customer data to CSV, so that I can analyze data offline or share with stakeholders. |

### 2.12 Invitations & Alerts

| # | User Story |
|---|-----------|
| A-85 | As an admin, I want to resend an expired or failed admin invitation, so that the invitee can still join. |
| A-86 | As an admin, I want to receive Slack alerts for critical system events (failed payments, missed pickups, errors), so that I can respond quickly without checking the portal. |
| A-87 | As an admin, I want the system to prevent duplicate property addresses for the same customer, so that accidental duplicate signups are blocked. |

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

### 3.6 Special Pickups

| # | User Story |
|---|-----------|
| T-26 | As a driver, I want to view special pickup requests assigned to me (address, service, price, date, photos), so that I know what custom work I need to do. |
| T-27 | As a driver, I want to mark a special pickup as completed, so that the customer is notified and I get credit for the work. |

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

---

## 4. CROSS-CUTTING / SYSTEM STORIES

| # | User Story |
|---|-----------|
| S-1 | As the system, I want to create a Stripe customer record on user registration, so that billing is ready from the start. |
| S-2 | As the system, I want to detect orphaned Stripe subscriptions on login and reconcile them, so that billing stays consistent. |
| S-3 | As the system, I want to send email notifications for address review decisions, missed pickup resolutions, and account transfers, so that users stay informed. |
| S-4 | As the system, I want to log all admin actions to an immutable audit log, so that there's a complete trail of administrative activity. |
| S-5 | As the system, I want to auto-create driver pay expense records on route completion, so that payroll tracking is automatic. |
| S-6 | As the system, I want to enforce a max of 50 stops per route, so that routes stay manageable for drivers. |
| S-7 | As the system, I want to gate driver access to routes/schedule behind completed onboarding, so that only verified drivers can work. |
| S-8 | As the system, I want to use WebSocket connections for real-time message delivery, so that conversations feel instant. |
| S-9 | As the system, I want session persistence via PostgreSQL with explicit `session.save()`, so that sessions survive across async operations. |
| S-10 | As the system, I want to send a payment confirmation email after each successful invoice payment, so that customers have a receipt. |
| S-11 | As the system, I want to send an alert email when a subscription payment fails, so that customers can fix their payment method. |
| S-12 | As the system, I want to verify email addresses on registration via a confirmation link, so that only valid emails are in the system. |
