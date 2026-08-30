# OpenCase

**Real problems, real solvers, verified outcomes.**

OpenCase is a problem-solving marketplace where people post real-world problems, solvers compete to provide the best solution, and an AI-powered matching engine connects the right solvers to the right problems. Accepted solutions are hash-verified with on-chain anchoring on Polygon Amoy testnet for immutable proof of solver reputation.

## Live Demo

Deploy to Vercel in one click:
1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → Import Git Repository
3. Deploy — no configuration needed

## Features

- **3 Portals:** Public (file problems), Solver (solve & build reputation), Admin (operations dashboard)
- **Real Backend:** Supabase for auth, database, and real-time subscriptions
- **AI-Powered:** Semantic problem matching, smart categorization, solution drafting (Gemini / Anthropic with free-tier fallback)
- **Blockchain Verified:** Accepted solutions are SHA-256 hashed and anchored on-chain via Supabase Edge Function calling a Polygon Amoy smart contract — tx visible on Polygonscan
- **Revenue Model:** Priority placements ($5), bounty escrow (10% take-rate), premium subscriptions ($9/mo)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Edge Functions) |
| AI | Gemini / Anthropic API with free-tier fallback |
| Blockchain | Solidity on Polygon Amoy + ethers.js + Supabase Edge Function |
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
- `blockchain_verifications` — On-chain proof records (tx hash, block number, network)

## Blockchain Setup

The on-chain verification pipeline has three components:

1. **Smart Contract** (`contracts/OpenCaseVerifier.sol`) — records solution hashes on Polygon Amoy
2. **Deployment Script** (`contracts/deploy.js`) — deploys the contract via Hardhat
3. **Edge Function** (`supabase/functions/verify-solution/index.js`) — signs and sends txs server-side

To deploy:
```bash
cd contracts
npm install
npx hardhat run deploy.js --network amoy
# Copy the contract address into js/config.js → BLOCKCHAIN_CONTRACT_ADDRESS
```

Then deploy the Edge Function:
```bash
supabase functions deploy verify-solution
supabase secrets set WALLET_PRIVATE_KEY=<your-demo-wallet-key>
```

## Project Structure

```
index.html              — Main entry point
js/
  config.js             — Environment configuration
  supabase-client.js    — Supabase SDK wrapper
  auth.js               — Authentication (signup/login/logout)
  db.js                 — Database CRUD operations
  ai.js                 — AI matching, categorization, drafting
  blockchain.js         — Solution verification via Edge Function
  app.js                — Main application logic
sql/
  schema.sql            — Database schema + RLS policies + seed data
contracts/
  OpenCaseVerifier.sol  — Solidity smart contract
  deploy.js             — Hardhat deployment script
  package.json          — Dependencies
supabase/
  functions/
    verify-solution/
      index.js          — Edge Function for on-chain txs
vercel.json             — Deployment configuration
```

## Admin Access

The admin console is gated by a SHA-256 hashed passcode checked client-side. This is a prototype demo gate only — not production security. A prominent DEMO MODE banner is displayed inside the console.

## API Keys

Set these in `js/config.js`:
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` — from your Supabase project settings
- `BLOCKCHAIN_CONTRACT_ADDRESS` — after deploying the smart contract
- AI provider keys (optional) — Gemini free tier or Anthropic

The Edge Function requires `WALLET_PRIVATE_KEY` set via `supabase secrets set`.

## License

MIT
