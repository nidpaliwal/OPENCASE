# OpenCase

**Real problems, real solvers, verified outcomes.**

OpenCase is a problem-solving marketplace where people post real-world problems, solvers compete to provide the best solution, and an AI-powered matching engine connects the right solvers to the right problems. Verified solutions are recorded on the Polygon blockchain for immutable proof of solver reputation.

## Live Demo

Deploy to Vercel in one click:
1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → Import Git Repository
3. Deploy — no configuration needed

## Features

- **3 Portals:** Public (file problems), Solver (solve & build reputation), Admin (operations dashboard)
- **Real Backend:** Supabase for auth, database, and real-time subscriptions
- **AI-Powered:** Semantic problem matching, smart categorization, solution drafting
- **Blockchain Verified:** Accepted solutions are hashed and verified on Polygon Amoy testnet
- **Revenue Model:** Priority placements ($5), bounty escrow (10% take-rate), premium subscriptions ($9/mo)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Edge Functions) |
| AI | Gemini / Anthropic API with free-tier fallback |
| Blockchain | Polygon Amoy testnet via ethers.js |
| Deploy | Vercel (static) |

## Quick Start

1. Open `index.html` in a browser — works with localStorage fallback (no backend needed)
2. For full features, run the SQL schema in Supabase SQL Editor
3. Update `js/config.js` with your Supabase credentials

## Database Schema

Run `sql/schema.sql` in your Supabase SQL Editor to create:
- `profiles` — User accounts (extends Supabase Auth)
- `problems` — Filed problems with categories, bounties, status
- `solutions` — Solver submissions with AI-assistance flags
- `solver_rankings` — Reputation leaderboard
- `ai_usage` — Daily AI draft quotas
- `activity_log` — Full audit trail
- `blockchain_verifications` — On-chain proof records

## Project Structure

```
index.html          — Main entry point
js/
  config.js         — Environment configuration
  supabase-client.js — Supabase SDK wrapper
  auth.js           — Authentication (signup/login/logout)
  db.js             — Database CRUD operations
  ai.js             — AI matching, categorization, drafting
  blockchain.js     — Solution verification on Polygon
  app.js            — Main application logic
sql/
  schema.sql        — Database schema + RLS policies + seed data
vercel.json         — Deployment configuration
```

## Admin Access

Passcode: `password` (SHA-256 hashed, client-side only — DEMO MODE)

## API Keys

Set these in `js/config.js`:
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` — from your Supabase project settings
- AI provider keys (optional) — Gemini free tier or Anthropic

## License

MIT
