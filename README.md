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
- **Surveys** — manager-effectiveness surveys published at close
- **1:1 tracking** — private participant notes, agendas and action items
- **Peer feedback** — manager-requested feedback with a response threshold
- **Succession** — critical-role slates and development actions
- **Single sign-on** — `/settings/sso` provider configuration for admins
- **Sign in** — `/login` with email-domain discovery and optional local demo accounts

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS

The portal uses Postgres-backed organization data for workforce, surveys, reviews, approvals, 1:1s, succession and peer feedback. Local demo sign-in and seeded accounts are available only when `AUTH_DEV_LOGIN=true` and `NODE_ENV` is not `production`.

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

### Change requests and approvals

Employee change requests are stored in Postgres and can use a sequential approval chain of one to six people or positions. Maintain reusable chains at `/approvals/templates`; position approvers resolve to current holders when a request is submitted. Approvers receive a unique link, while the request page tracks decisions, comments, and the event timeline. Messages are queued in `/outbox` for review and delivery.

Set `APP_BASE_URL` to the externally reachable origin before sending approval links outside local development. If unset, links use `http://localhost:3000`.

### Authentication and peer feedback

Configure OIDC or SAML providers at `/settings/sso`; see [SSO setup](docs/auth-sso.md). Manager-effectiveness survey scores are published only after a survey closes. Peer feedback results remain hidden until the request's minimum response count is reached. Managers and reports see only their own private 1:1 notes.

Routes include `/one-on-ones`, `/feedback`, `/surveys`, `/reviews`, and `/succession`. Feedback invitations are available at `/f/{token}`; survey invitations and manager result shares use `/s/{token}` and `/r/{token}`.

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
