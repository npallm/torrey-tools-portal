# HR metrics & data-visualization research (SHRM / PHR synthesis)

This document is the basis for the analytics module (`lib/metrics/`) and the Postgres schema (`db/migrations/`).
Every formula below is implemented in `lib/metrics/calc.ts`, unit-tested in `tests/metrics.calc.test.ts`, and shown in-app next to its chart (`lib/metrics/catalog.ts`).

## Sources reviewed

| Source | What it contributes |
| --- | --- |
| [SHRM BASK (2026)](https://www.shrm.org/content/dam/en/shrm/credentials/shrm-certification/bask/shrm-bask.pdf) | Analytical Aptitude competency (Data Advocate, Data Gathering, Data Analysis, Evidence-Based Decision-Making); required metric knowledge |
| [HRCI PHR Exam Content Outline](https://www.hrci.org/docs/default-source/default-document-library/hrci_phr-exam-content-outline.pdf) | PHR responsibilities that call for metrics and HRIS reporting |
| [BLS JOLTS definitions](https://www.bls.gov/jlt/jltdef.htm), [BLS Handbook of Methods](https://www.bls.gov/opub/hom/jlt/calculation.htm) | Definitions of employment, hires and separations; separation categories; how rates are computed |
| [ISO 30414 human capital reporting](https://www.iso.org/standard/69338.html) | The 11 human-capital reporting areas (costs, diversity, productivity, turnover, workforce availability, ...) |
| [Turnover (employment)](https://en.wikipedia.org/wiki/Turnover_(employment)) | Turnover formula using average headcount, with a worked example (used as a unit test) |
| AIHR: [HR metrics](https://www.aihr.com/blog/hr-metrics-examples/), [compa ratio](https://www.aihr.com/blog/compa-ratio/), [absenteeism](https://www.aihr.com/blog/absenteeism-rate/), [dashboards](https://www.aihr.com/blog/hr-dashboard/) | Practitioner formulas (group compa-ratio, range penetration, absence rate, revenue per employee, HR-to-employee ratio) and dashboard guidance |
| [Finch API](https://developer.tryfinch.com/products/organization/Overview) (organization + payroll) | Field-level shape of HRIS and payroll data the schema ingests |

**Gap:** SHRM's how-to guides (e.g. "Calculate Employee Turnover Rate") only show their content to logged-in members, so their text could not be checked. The turnover formula used here matches BLS (separations ÷ employment × 100), so it doesn't depend on those guides.

## What SHRM and PHR expect HR to measure and show

- **SHRM BASK, Analytical Aptitude.** HR professionals should know how to "interpret graphs and charts (bar charts, line graphs, scatterplots, histograms)". They should use data to support a business case through "visualization, graphical representation, storytelling". They should also "benchmark HR initiatives and outcomes" and "promote the use of HR metrics for understanding organizational performance".
- **SHRM BASK, metric knowledge it names:**
  - Retention and turnover: voluntary turnover rate, turnover at a specific location or level, vacancy rate, quality of hire.
  - Total rewards: compa-ratio.
  - HR function: HR staff per full-time employee, KPIs, balanced scorecard.
  - Inclusion and diversity metrics.
- **HRCI PHR:**
  - 1.2: org charts and span of control.
  - 1.4: attrition rates, ROI.
  - 3.2: succession data such as compensation, performance, turnover and exit surveys.
  - 4.4: pay equity, benchmarking, salary bands.
  - 7.1–7.2: maintain HRIS personnel data and status changes; generate reports, analytics and trends.
- **ISO 30414 reporting areas:** compliance & ethics, costs, diversity, leadership, culture, health & well-being, productivity, recruitment/mobility/turnover, skills, succession, workforce availability.

## Metric definitions implemented

Conventions:
- A rate with a zero denominator is shown as "not available" (null), never as 0.
- Periods are inclusive date ranges.
- Contingent workers are excluded from employee rates. This follows JOLTS, which excludes agency and contract workers from employment.

| Metric | Formula | Notes |
| --- | --- | --- |
| Headcount | employees with hire ≤ date ≤ last day | Contingent reported separately |
| Average headcount | mean over months of (start-of-month + end-of-month headcount) ÷ 2 | Months clipped to the period |
| Turnover rate | separations ÷ average headcount × 100 | Split into JOLTS categories (Quit, Layoff/Discharge, Other); partial periods annualized × 365 ÷ days |
| Retention rate | start-of-period employees still employed at end ÷ start headcount × 100 | Cohort; excludes new hires |
| New-hire turnover | hires in period who left in period ÷ hires in period × 100 | |
| Compa-ratio | salary ÷ range midpoint; group = Σ salary ÷ Σ midpoint | 0.80–1.20 reference band |
| Range penetration | (salary − min) ÷ (max − min) × 100 | |
| Absence rate | unplanned absence days ÷ (weekdays employed × FTE) × 100 | Planned leave excluded |
| Span of control | direct reports of active managers ÷ active managers | |
| Average tenure | mean years since hire | |
| Vacancy rate | open budgeted positions ÷ total positions × 100 | |
| Promotion / mobility rate | promotions (+ lateral transfers) ÷ average headcount × 100 | |
| HR staff per 100 FTE | HR FTE ÷ total FTE × 100 | |
| Review completion | completed ÷ total reviews × 100 | |
| Labor cost | earnings (excl. reimbursements) + employer taxes + employer contributions | Read-only payroll, by pay date |
| Labor cost per employee | labor cost ÷ average headcount, annualized | |
| Labor cost to revenue | annualized labor cost ÷ annual revenue × 100 | |
| Revenue per employee | annual revenue ÷ average headcount | |
| Overtime share | (overtime + double overtime) ÷ earnings × 100 | |
| Employer burden rate | (employer taxes + contributions) ÷ wages × 100 | |

## Visualization rules applied in the app

1. **One question per screen.** The user picks a dashboard and then a view. Only one chart is shown at a time, with headline numbers above it. This replaces scrolling through many charts.
2. **Each view only offers formats that fit its data:**
   - Trends over time: line first, then column or table.
   - Category comparisons: bars sorted largest first, then column or table.
   - Pie only for part-to-whole totals (headcount mix, cost components, earnings mix, time-off mix). Never for rates or ratios.
3. **Always show the formula, numerator and denominator** next to the chart so a reader can check the number. This is the "evidence-based" requirement in the SHRM BASK.
4. **Reference lines for benchmarks.** Compa-ratio shows the midpoint and the 0.80/1.20 band. Range penetration shows 50%.
5. **Table view for every chart**, for accessibility and exact values.
6. **Period is explicit:** last 12 months, year to date, or prior year. Partial-year turnover is also shown annualized.

## Data-model principles (schema in `db/migrations/001_init.sql`)

- **Every table belongs to a client organization:** each row carries `organization_id`. Legal entities, locations and a department tree hang off the organization.
- **Person vs. employment vs. job:**
  - `workers` holds the person.
  - `employment_periods` holds each stint, so rehires add a row.
  - `job_assignments` holds effective-dated job data, with exclusion constraints so date ranges can't overlap.
  - This keeps headcount, tenure and turnover correct across rehires and internal moves.
- **Uses Finch's field names and values:** worker type/subtype, `employment_status`, `flsa_status`, income units, class code, union, custom fields, and external ids per connection for idempotent re-syncs.
- **Portal-owned data Finch doesn't provide:**
  - Job profiles and pay ranges (for compa-ratio)
  - Positions (for vacancy rate)
  - Separation category and reason, regrettable, eligible for rehire
  - Leaves of absence and absences
- **Read-only payroll:** pay runs, pay statements and line items (earnings, taxes, deductions, employer contributions), stored in cents like Finch. Used for labor-cost analytics; the portal never administers payroll.
- **Privacy:**
  - Demographics are in a separate restricted table, gated by `portal_users.can_view_demographics`.
  - SSN is never stored.
  - Integration tokens stay in the secret manager.
  - An audit log records changes.
