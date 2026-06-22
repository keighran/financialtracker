# CLAUDE.md

Guidance for working in this repository.

## Project

Australian FIRE (Financial Independence Retire Early) Manager — a SaaS wealth
tracker with Australian tax rules (CGT discounts, franked dividends, negative
gearing) and FIRE projections.

- **Backend**: FastAPI + SQLModel, `backend/app/` (3-tier: `api/` → `services/` → `models/`).
  Postgres with automatic SQLite fallback for local dev ([db.py](backend/app/db.py)).
- **Frontend**: Next.js 14 App Router (TypeScript), Clerk auth, Recharts. `frontend/src/`.
- **Auth**: Clerk (JWKS/PEM JWT verification backend-side). Users auto-provisioned on
  first valid token. Superadmin `admin@astradigital.com.au` seeded on startup.

### Architecture notes
- The schema uses a **unified ledger** model rather than per-asset tables: `Account`
  (all account types via `AccountType` enum), `Asset` (ticker/price registry),
  `Transaction` (all transaction types incl. dividends). Integer PKs, not UUIDs.
- FIRE targets / tax settings live in `UserSettings`, not on `User`.

## Change log

### Bug fix
- [auth/clerk.py](backend/app/auth/clerk.py): added missing `import json` — the JWKS
  verification path called `json.dumps()` and would `NameError` on any JWKS-based login.

### Performance — eliminated N+1 query patterns
- [services/aggregation.py](backend/app/services/aggregation.py) `calculate_current_net_worth`:
  collapsed 6 per-type account queries into 1 (bucketed in memory); batch-load assets
  in one `id IN (...)` query instead of `db.get(Asset)` per transaction.
- [api/ledgers.py](backend/app/api/ledgers.py) `get_equities_portfolio`: batch-load assets
  (was `db.get(Asset)` per transaction).
- [api/tax_projections.py](backend/app/api/tax_projections.py) `/cgt`: resolve ticker→asset
  once, then DB-filter transactions by `asset_id` (was loading ALL transactions and
  lazy-loading each asset). `/dividends`: batch-load assets.

### Performance — Postgres connection pooling
- [db.py](backend/app/db.py): added `pool_pre_ping=True`, `pool_size=10`,
  `max_overflow=20`, `pool_recycle=1800` to the Postgres engine. SQLite fallback untouched.

### Refactor — removed double net-worth computation on dashboard
- New [services/projections.py](backend/app/services/projections.py):
  `build_fire_projection(user_id, db, current_net_worth)` takes an already-computed net
  worth instead of recalculating it.
- New `GET /api/dashboard/overview` ([api/dashboard.py](backend/app/api/dashboard.py)):
  returns `summary` + `settings` + `fire` in one response, net worth computed once.
- `/api/tax-projections/fire` refactored to reuse `build_fire_projection`.
- [dashboard/page.tsx](frontend/src/app/(authenticated)/dashboard/page.tsx): one request
  to `/overview` instead of two sequential requests.

### Frontend — Clerk token migration
- Migrated all 16 client files from deprecated `user.getToken()` to
  `useAuth().getToken()` (the current Clerk async API). Added `useAuth` import and
  `const { getToken } = useAuth();` alongside existing `useUser()`.

### Fixed — TypeScript build errors (Clerk SDK upgrade fallout)
- `app/page.tsx` / `middleware.ts`: Clerk `auth()` is async in this SDK — `await auth()`
  (and `auth.protect()` in middleware).
- `app/layout.tsx` + `components/Sidebar.tsx`: moved `afterSignOutUrl` to `<ClerkProvider>`
  (prop removed from `<UserButton>`).
- `dashboard/page.tsx`: guarded Recharts formatter args against `undefined`.
- `npx tsc --noEmit` now passes clean; `next build` is unblocked.

### Fixed — ledger transactions not appearing (crypto / stocks / etfs)
Symptom: entered transactions seemed "not saved". They were saved, but invisible:
- The crypto/stocks/etfs pages attached transactions to a **Cash** account, but
  holdings and net worth are computed only from **Brokerage/Crypto**-type accounts,
  so the rows were excluded from the portfolio.
- `GET /api/ledgers/transactions` returned rows without the nested `asset` (SQLModel
  doesn't serialize relationships), so the history filter `t.asset.asset_class === ...`
  matched nothing.

Fix:
- `api/ledgers.py`: added `GET`/`POST /api/ledgers/investment/accounts` (Brokerage/Crypto
  account endpoints — they never existed, which is why the pages kludged with cash
  accounts). `get_transactions` and `get_dividends` now return a `TransactionRead`
  schema with the embedded `asset` (batch-loaded via `_serialize_transactions`, no N+1).
- `crypto/page.tsx`, `stocks/page.tsx`, `etfs/page.tsx`: use/create the correct
  investment account type instead of cash.
- Note: pre-existing rows entered before this fix sit on an auto-created Cash account
  and need re-pointing to a Crypto/Brokerage account to become visible.

### Feature — crypto coin picker (CoinGecko)
To reduce ticker-entry errors, the crypto page uses a searchable dropdown instead of
free-text symbol/name fields.
- `api/ledgers.py`: `GET /api/ledgers/crypto/coins` proxies CoinGecko's public
  `coins/list` (no API key), caching the full list in memory for 24h (one upstream
  fetch shared across users; serves stale cache if CoinGecko is unreachable).
- `crypto/page.tsx`: searchable picker (filter by name or symbol, top 50 matches);
  selecting a coin sets symbol + name. Falls back to the original manual text inputs
  if the coin list can't load. Backend proxy used (not a browser call) to avoid CORS
  and cache once server-side — matches the intended "Live Price Engine" architecture.

### Fixed / Feature — onboarding journey
The 3-step wizard and `/api/onboarding/complete` existed but were never triggered for
first-time users (no redirect, no status endpoint), so onboarding appeared inactive.
- `api/onboarding.py`: added `GET /api/onboarding/status` → `{has_completed_onboarding, is_superadmin}`.
- `(authenticated)/layout.tsx`: guard checks the status on entry to any authenticated
  page and `router.replace('/onboarding')` if incomplete. Fails open if the check errors;
  no redirect loop since `/onboarding` lives outside the `(authenticated)` route group.
- `onboarding/page.tsx`: expanded from 3 steps to 7 — income, FIRE targets, age, then
  optional cash / super / liabilities seeding (via existing ledger endpoints), then a
  review step. `/api/onboarding/complete` is posted last (it sets the completion flag).

## Deployment (QNAP NAS — 192.168.50.100)
- Deployed via Container Station (docker + compose v2.29) under `/share/Container/fire`.
- Access: frontend http://192.168.50.100:3000, backend http://192.168.50.100:8000, db :5432.
- Runs the **dev** servers (`uvicorn --reload`, `npm run dev`) on bind mounts, so deploying
  a code change = copy the changed file to the NAS path; the servers hot-reload (no rebuild).
- `docker compose` must run via `sudo` on QNAP — the docker wrapper needs admin to create
  its config dir (`vinay` alone hits "mkdir homes/vinay: permission denied").
- `/share/Container/fire/deploy.sh` runs `docker compose up -d --build` for full rebuilds.
- `compose` is env-driven via a gitignored `.env`:
  - `NEXT_PUBLIC_API_URL` → NAS IP (browsers can't resolve the internal `backend` host).
  - `CLERK_FRONTEND_API_URL` passed to the backend so it can fetch JWKS / verify tokens
    (derive from the publishable key: base64 of the `pk_...` payload is the frontend domain).
  - Clerk keys live in `.env`; without them the frontend falls back to Clerk "keyless mode".

## Conventions
- Verify backend edits with `python -m py_compile <files>`; frontend with `npx tsc --noEmit`.
- All user-scoped queries filter by `user_id` (row-level security is enforced in the API layer).
- Batch-load related rows (`id IN (...)`) rather than per-row `db.get()` inside loops.
