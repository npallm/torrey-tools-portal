# torrey-tools-portal

Client portal for Torrey Tools HR consulting — covers core HR work **outside of** payroll, benefits, and recruiting:

- **Dashboard** — quick counts and pending items
- **Employee Directory** — roles, departments, managers, status
- **Change Requests** — submit and review employee changes (title, comp, schedule, status)
- **Time Off** — PTO requests and approvals
- **Analytics** — turnover, compa ratio, headcount, PTO usage charts
- **Integrations** — Finch API client to sync data from 200+ HRIS/payroll providers
- **Documents** — policies, handbook, forms, compliance records
- **Onboarding** — new-hire checklists
- **Reviews** — performance review cycles

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS

Data currently comes from seed fixtures in `lib/data.ts`. The next milestone is wiring those reads to Supabase (auth + Postgres) — function signatures are designed to swap cleanly.

### Finch

Set `FINCH_API_TOKEN` to a Finch access token (use the sandbox provider while testing) and optionally `FINCH_API_URL`. Without a token, `/integrations` and `/api/finch/directory` fall back to seed data. See `.env.example`.

## Develop

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build
```

Copy `.env.example` to `.env.local` and fill in `FINCH_API_TOKEN` to enable live sync.
