# torrey-tools-portal

Client portal for Torrey Tools HR consulting — covers core HR work and read-only payroll analytics:

- **Dashboard** — quick counts and pending items
- **Employee Directory** — roles, departments, managers, status
- **Change Requests** — submit and review employee changes (title, comp, schedule, status)
- **Time Off** — PTO requests and approvals
- **Analytics** — HR metrics with one switchable chart at a time, including read-only labor-cost analytics
- **Integrations** — Finch API client to sync data from 200+ HRIS/payroll providers
- **Documents** — policies, handbook, forms, compliance records
- **Onboarding** — new-hire checklists
- **Reviews** — performance review cycles

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS

Directory, PTO, and other existing portal pages continue to use the fixtures in `lib/data.ts`. Analytics uses a separate workforce dataset, loading it from Postgres when configured and falling back to sample data when no database is available.

## Analytics and data

The analytics metrics are calculated from the source-agnostic dataset in `lib/metrics/`. The formulas and metric definitions are documented in [the HR metrics research notes](docs/hr-metrics-research.md). Payroll records are read-only and support labor-cost reporting.

To run analytics against local Postgres 16:

```bash
npm run db:up
# Add DATABASE_URL=postgres://torrey:torrey@localhost:5432/torrey_portal to .env.local
npm run db:reset
npm run dev
```

The database scripts load `.env.local`; they do not have a built-in database URL. Analytics automatically uses sample data when `DATABASE_URL` is not set or Postgres is unavailable.

Run the metric tests with:

```bash
npm test
```

### Finch

Set `FINCH_API_TOKEN` to a Finch access token (use the sandbox provider while testing) and optionally `FINCH_API_URL`. Without a token, `/integrations` and `/api/finch/directory` fall back to seed data. See `.env.example`.

## Develop

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build
```

Copy `.env.example` to `.env.local`, then set `DATABASE_URL` for Postgres-backed analytics. Set `FINCH_API_TOKEN` to a Finch access token (use the sandbox provider while testing) to enable live sync.
