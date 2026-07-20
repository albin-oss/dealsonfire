# DOF — Production Deployment (First Light runbook)

Release 1.5. Everything below uses machinery that already exists in this repo;
the only external prerequisites are a Vercel project and a PostgreSQL 17 database.

## 1 · Provision

| Piece | Requirement |
|---|---|
| Vercel project | linked to this repository, framework preset **Nuxt** |
| PostgreSQL | v17, publicly unreachable except from Vercel (e.g. Neon/Supabase/RDS) |
| Blob store | Vercel Blob (token) — the Media Port's production adapter |

## 2 · Environment variables (Vercel → Settings → Environment Variables)

| Variable | Value | Notes |
|---|---|---|
| `NUXT_DATABASE_URL` | `postgres://dof_app:…@…/dof` | the **restricted role**, not the owner (step 3) |
| `NUXT_IDENTITY_MODE` | `session` | dev-header identity refuses production (gated + CI-checked) |
| `NUXT_CRON_SECRET` | long random string | outbox cron auth; endpoint fails closed without it |
| `BLOB_READ_WRITE_TOKEN` | from Vercel Blob | absent → sandbox adapter (never use in prod) |
| `NODE_ENV` | `production` | enables HSTS + CSP + fail-closed behaviors |

## 3 · Database bootstrap (run once, as the database OWNER)

```bash
export DATABASE_URL='postgres://OWNER:…@…/dof'
npm run db:migrate            # forward-only migrations (17)
npm run db:seed               # capability registry (idempotent)
psql "$DATABASE_URL" -c "CREATE ROLE dof_app LOGIN PASSWORD '…'"
APP_ROLE=dof_app npm run db:grants   # TD-001: append-only enforcement by role
```

Re-run `db:migrate` + `db:grants` on every schema deploy (new audit partitions
need the same protections — the grants file loops them).

## 4 · Cron

`vercel.json` already declares the outbox lane (every minute):
`GET /api/internal/outbox-dispatch` — Vercel sends the cron; set the
**Authorization: Bearer `NUXT_CRON_SECRET`** header via Vercel cron settings,
or rely on Vercel's protection-bypass for crons per your plan. The endpoint
drains **all four** domain outboxes (merchant, commerce, identity, operations)
and runs housekeeping + idempotency purge.

## 5 · Deploy & verify

```bash
vercel deploy --prod
npm run smoke -- https://<your-deployment>   # read-only golden paths, exit 0 = green
```

The smoke asserts: Home SSR, feed API (private cache), 404 masking (V6),
security headers incl. HSTS + CSP, the /discover 301, and that the cron
endpoint fails closed.

## 6 · First cohort (the reason this exists)

The Learning Ledger (Release 1.4) reads real behavior only after real people
arrive. Hand-recruit 3–5 real merchants; their journey is self-serve from
`/ignite`. Re-run the ledger after ~4 weeks of traffic:

```bash
DOF_LEARNING_DATABASE_URL='postgres://…read-only…' npm run learning
```

Use a read-only role for the ledger. Choose Release 1.6 from that readout.
