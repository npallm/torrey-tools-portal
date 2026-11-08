# torrey-tools-portal

Client portal for Torrey Tools HR consulting — covers core HR work **outside of** payroll, benefits, and recruiting:

- **Dashboard** — quick counts and pending items
- **Employee Directory** — roles, departments, managers, status
- **Time Off** — PTO requests and approvals
- **Documents** — policies, handbook, forms, compliance records
- **Onboarding** — new-hire checklists
- **Reviews** — performance review cycles

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS

Data currently comes from seed fixtures in `lib/data.ts`. The next milestone is wiring those reads to Supabase (auth + Postgres) — function signatures are designed to swap cleanly.

## Develop

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build
```
