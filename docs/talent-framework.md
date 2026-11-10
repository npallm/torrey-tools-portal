# Talent framework: surveys, performance, 1:1s, succession

Schema: `db/migrations/002_talent.sql`, `003_manager_survey.sql`. Calculations: `lib/surveys/managerScores.ts`, `lib/talent/*.ts`, `lib/org/hierarchy.ts` (unit tests in `tests/`).

## Organization dimensions
- **Division / department / team**: `departments.unit_type` on the existing department tree. A person's division is the nearest ancestor whose type is `division`.
- **Supervisory org** (Workday-style): everyone under a manager, directly or indirectly. The manager is not a member of their own sup org (`lib/org/hierarchy.ts`).
- Also available as filters: location, worker type, and tenure band (`< 1 yr`, `1–2 yrs`, `3–5 yrs`, `6+ yrs`).

## Manager-effectiveness surveys
- **One survey type.** All items are 1–5 Likert (Strongly disagree … Strongly agree).
- **Question bank:** 20 statements, 5 in each of 4 categories: Direction & Clarity, Coaching & Growth, Trust & Inclusion, Empowerment & Wellbeing.
  - Defaults are in `lib/surveys/managerQuestions.ts`. Each organization edits its copy in `survey_question_bank` from `/surveys/questions`.
  - A survey copies the active bank items when it is created, so editing the bank never changes past surveys.
- **Who rates whom:** each invitee rates their direct manager. At launch, the invitee's management chain and org attributes are frozen on the invitation.
- **Scores** (`lib/surveys/managerScores.ts`):
  - A respondent's score is the mean of the items they answered. A manager's overall and category scores are the mean of those respondent scores, so every respondent counts equally.
  - An item score is shown only when at least 5 respondents answered it.
- **Anonymity:**
  - A manager is scored and ranked only with at least 5 direct-report respondents. Ranking is competition-style (1, 2, 2, 4).
  - A sup-org total, which includes everyone under the leader, is shown only when:
    - it has at least 5 respondents,
    - the respondents not covered by a scored direct team number 0 or at least 5, and
    - for every pair of nested sup orgs that are both shown, the difference between their uncovered respondents is 0 or at least 5. Otherwise the smaller one is hidden.
  - Without these rules, you could subtract a scored team or a nested org from a total and recover an unscored small team's average.
  - Response counts are never shown for managers or orgs without a score.
- **Persistence:** after every submission and when the survey closes, the server recomputes the scores and upserts `survey_manager_scores` (scope `direct` or `sup_org`). Pages and APIs read only these rows.
- **Views:**
  - The admin page shows the ranking table (direct reports) and a toggle for sup-org totals, with filters by the manager's division and department.
  - Each manager gets a private `/r/<token>` link showing their own team score and rank, plus a toggle for their whole-org total. It updates live while the survey is open.

## Performance management
- **Templates:** a rating scale, plus weighted competency and question items, and an optional goals section with its own weight.
- **Cycles** run through: planning → self review → manager review → calibration → released → closed.
- **Reviewer roles:** self, manager, peer, upward.
- **Scores:**
  - Weighted score = Σ(weight × rating) ÷ Σ weight over rated items.
  - Goal attainment = weight-averaged progress, with each goal capped at 0–100%.
  - The self–manager gap is shown per person.
- **Calibration:** compares the manager's proposed overall rating with the calibrated rating. It shows the rating distribution and how many ratings moved up or down.

## 1:1s
- Each manager–report pair has a series with a cadence (default 14 days).
- Meetings have shared notes, private notes for each side, and an optional 1–5 pulse from the report.
- The agenda queue fills up between meetings. Open action items carry forward until completed.
- **Health:** status depends on the days since the last held meeting:
  - Up to the cadence: On track ("Not started" if no meeting has been held yet).
  - Up to 1.5 × the cadence: Due.
  - Beyond that: Overdue.
- **Adherence:** meetings held ÷ meetings expected over the trailing 90 days, capped at 100%.

## Succession (instead of the 9-box)
The 9-box squeezes potential into one subjective axis. This model splits it out and puts the focus on risk to the business:
- **Critical roles:**
  - Risk = impact of loss (1–5) × probability of loss (1–5), banded High at 15+, Medium at 8–14, otherwise Low.
  - A default probability can be suggested from the incumbent's flight risk and retirement window.
- **Successor slates** with readiness: ready now, 1–2 years, or 3+ years. An emergency backup can be flagged.
  - Bench strength: Strong, Adequate, Thin or None.
  - A role counts as covered with at least 1 ready-now successor or at least 2 ready in 1–2 years.
  - Bench coverage = covered roles ÷ critical roles.
  - Single points of failure = high-risk roles that aren't covered.
- **Potential** is rated separately on aspiration, ability and engagement (low, moderate or high). These are the three potential factors in CEB/Gartner's high-potential research.
  - High potential = high on all three.
  - Emerging = no low ratings and a sum of at least 7.
  - Anything else = Developing.
  - These sit next to the performance trend from the last two calibrated ratings, flight risk, skills and mobility.
- **Development actions** follow 70-20-10: experience, exposure and education, linked to the target role.

## Data flow (every displayed number)

Every number on screen is computed on the server by the function listed below, from the stored inputs listed. Pages never redo the math.

| Metric | Stored inputs | Function | Persisted output | Shown on |
| --- | --- | --- | --- | --- |
| Manager score, category/item scores, rank | `survey_answers`, `survey_invitations.manager_chain` | `managerSurveyResults` | `survey_manager_scores` (direct) | `/surveys/[id]`, `/r/[token]` |
| Sup-org totals | same | `managerSurveyResults` | `survey_manager_scores` (sup_org) | `/surveys/[id]`, `/r/[token]` |
| Response rate | `survey_invitations`, `survey_responses` | `managerSurveyResults` | computed on read | `/surveys`, `/surveys/[id]` |
| Weighted review score, self–manager gap | `review_item_responses`, `review_template_items.weight` | `weightedScore`, `selfManagerGap` | computed on read | `/reviews/assignments/[id]` |
| Proposed rating | manager item responses, `goals`, template `goals_weight` | `proposedRating` | `review_outcomes.proposed_rating` | `/reviews/[cycleId]` |
| Calibration shift, rating distribution | `review_outcomes` | `calibrationShift`, `ratingDistribution` | computed on read | `/reviews/[cycleId]` |
| Goal attainment | `goals` | `goalAttainment` | computed on read | reviews pages |
| 1:1 status, adherence | `one_on_one_series`, `one_on_one_meetings` | `oneOnOneHealth` | computed on read | `/one-on-ones` |
| Action item status | `one_on_one_action_items` | `actionItemStatus` | computed on read | `/one-on-ones/[id]` |
| Role risk score and band | `critical_roles.impact_of_loss`, `probability_of_loss` | `roleRiskScore`, `riskBand` | computed on read | `/succession` |
| Bench strength, coverage, single points of failure | `succession_candidates.readiness` | `benchStrength`, `benchCoverage`, `singlePointsOfFailure` | computed on read | `/succession` |
| Potential segment, performance trend | `talent_profiles`, `review_outcomes.calibrated_rating` | `potentialSegment`, `performanceTrend` | computed on read | `/succession` |
| Supervisory org membership | `job_assignments.manager_worker_id` | `managerChain`, `supOrgMembers` | frozen on `survey_invitations` | all filters |

## Known limitations
- The portal has no login yet. Private 1:1 notes and compensation are only labelled as private in the UI, not enforced. `portal_users` roles and flags in `001_init.sql` will enforce them once auth lands.
- Invitations go to the `outbox_messages` table until an email provider is configured.
