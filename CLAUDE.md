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

## Known pre-existing issues (NOT yet fixed — will block `next build`)
- `frontend/src/app/page.tsx:5` and `frontend/src/middleware.ts:12`: Clerk `auth()` is
  async in this SDK version — call sites need `await auth()`.
- `frontend/src/components/Sidebar.tsx:122`: `afterSignOutUrl` prop no longer valid on `<UserButton>`.
- `frontend/src/app/(authenticated)/dashboard/page.tsx:179,212`: Recharts formatter args
  possibly `undefined`.

## Conventions
- Verify backend edits with `python -m py_compile <files>`; frontend with `npx tsc --noEmit`.
- All user-scoped queries filter by `user_id` (row-level security is enforced in the API layer).
- Batch-load related rows (`id IN (...)`) rather than per-row `db.get()` inside loops.
