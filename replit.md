# Waste Management Client Portal

## Overview
A React + Vite frontend application for a waste management client portal. Provides login/registration, dashboard, billing, service management, and more.

## Recent Changes
- 2026-02-15: Initial Replit setup — configured Vite for port 5000, removed CDN importmap in favor of bundled deps, set up deployment.

## Project Architecture
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS (loaded via CDN in index.html)
- **Entry Point**: `index.tsx` → `App.tsx`
- **Components**: `components/` directory
- **Services**: `services/` directory (Gemini AI, Stripe, address lookup, etc.)
- **Config**: `vite.config.ts`, `tsconfig.json`

## Running
- Dev: `npm run dev` (port 5000)
- Build: `npm run build` (outputs to `dist/`)
- Deployment: Static site from `dist/`

## User Preferences
- None recorded yet.
