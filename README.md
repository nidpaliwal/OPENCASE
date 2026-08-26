# OpenCase

**Real problems, real solvers, verified outcomes.**

OpenCase is a single-page prototype for a problem-solving marketplace. People post real-world problems for free, solvers pick them up and submit solutions, filers accept the fix that works, and an admin console handles moderation and shows monetization signals — all in one static `index.html` file.

> This is a **prototype**. There are no real accounts, no real payments, and no real server-side authentication. See [Known limitations](#known-limitations) below before using it for anything beyond a demo.

## Portals

The app is organized into three portals, reachable from the home screen:

### 🧾 Public Portal — file & track problems
- File a problem for free (title, description, category, optional bounty, optional $5 "priority placement" boost)
- Check for an existing fix before filing (simple keyword match against solved cases)
- Track cases filed under your name in **My Cases**, and accept a submitted solution once it works
- Search the **Solved Library** — an archive of previously solved cases anyone can search

### 🛠️ Solver Portal — work cases, build proof
- Browse the open board and submit solutions to any case
- Optionally draft a solution with AI assistance (calls the Anthropic API; falls back to a structured template if the call fails), limited to 3 free drafts/day unless "Premium" (simulated) is active
- **My Portfolio** — verified wins (accepted solutions) and cases currently in play
- **Reputation** — a leaderboard ranking solvers by number of accepted solutions

### 🔐 Admin Console — operations dashboard
- Gated by a client-side passcode (SHA-256 hashed) — clearly labeled as demo-only security
- **Dashboard** — live tiles (open/solved/flagged/submissions/solvers/revenue) and a recent activity feed; includes a one-click sample data seeder for a cold-start board
- **Moderation** — review flagged problems/solutions, remove or restore items
- **All Cases** — filterable list of every case (all / open / solved / flagged / removed) with per-case moderation actions
- **Insights & Data** — demand by category, top solver profiles, simulated monetization figures, and a full CSV dataset export

## Tech stack

- Plain HTML/CSS/JS — no build step, no framework, no dependencies beyond Google Fonts
- Persistence via a `window.storage` key/value API (shared, cross-user data for the board; private, per-user data for local preferences), with a `localStorage` fallback if `window.storage` isn't available
- AI drafting calls `https://api.anthropic.com/v1/messages` (`claude-sonnet-4-6`) directly from the browser

## Running it

Just open `index.html` in a browser. No server, build tools, or install step required.

```bash
open index.html   # macOS
# or double-click the file / drag it into a browser tab
```

On first load with an empty board, use the Admin Console → Dashboard → **Seed sample cases** button to populate a few example cases, solutions, and a ranked solver.

## Data model

All data lives under a few storage keys:

| Key | Scope | Contents |
|---|---|---|
| `opencase_problems` | shared | Array of problem/case objects |
| `opencase_solutions_<problemId>` | shared | Array of solution objects for that problem |
| `opencase_solvers` | shared | Map of solver name → accepted-solution count |
| `opencase_prefs` | private (per user) | Local preferences: saved names, AI usage counters, premium flag |

## Known limitations

This is a prototype, not a production app — a few things to be aware of before extending it:

- **No real auth.** Both filer and solver identity are self-declared free-text names (honor system). The admin gate is a hashed passcode checked entirely client-side and is explicitly bypassable by anyone technical.
- **No real payments.** Bounties, the $5 priority-placement fee, and Premium ($9/mo) are all simulated — no payment processor is wired up.
- **Last-write-wins storage, no transactions.** Writes are read-modify-write against a shared key. Two people acting on the same case at nearly the same moment (e.g. submitting solutions simultaneously) can race and one update can be lost.
- **AI drafting calls the Anthropic API directly from the browser** with no key management shown here — wire this through your own backend before shipping.

## Suggested next steps

- Move admin auth and payment/bounty handling to a real backend
- Add optimistic concurrency (versioning or merge-on-write) for shared records
- Real accounts instead of self-declared names
