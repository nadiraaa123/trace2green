# 2027–2031 scenario, Customer Success and lifecycle

## Two separate data layers

| Layer | What | Where | Shown in |
|---|---|---|---|
| Analytical dataset | 100 workbook suppliers, 277 reports (Jan–Mar 2027), CMP-A/CMP-B | `suppliers`, `monthly_reports`, … (unchanged) | Company portal |
| Growth scenario (projection) | 16 companies `SCN-C01…16`, 880 suppliers `SCN-S0001…0880`, 13 CS `CS-S01…13` | `scenario_companies`, `scenario_suppliers`, `cs_staff` (scenario:true), `meta/financial_scenario` | Platform Admin › Skenario, CS › Skenario |
| Operations (actual) | lifecycle per company–supplier, CS assignments, follow-ups, company subscriptions | `supplier_lifecycle`, `cs_assignments`, `cs_followups`, `company_subscriptions` | Platform Admin, CS |

The scenario never creates reports, payments, invoices or contracts, and never counts in operational KPIs.
Scenario IDs cannot collide with `SUP-###` (workbook + live registrations from the counter) or `CMP-*`.

Why separate: the workbook has 90–94 suppliers reporting per month in Jan–Mar 2027, five times the
financial model's trial quota (10 per new company → 20 in 2027), so it cannot represent the 2027 commercial scenario.

## Operational simulation (not all-success)
The financial model assumes 100% conversion and 0% churn. `src/lib/opsSim.ts` adds a deterministic,
read-only simulation per scenario supplier and month (registration, trial outcome, on-time/late/failed
activation, monthly reporting, needs-help flags, annual renewal) from ILLUSTRATIVE rates in `OPS_SIM_RATES`.
Nothing is written to Firestore. Scenario CS accounts see this on their home page; Platform Admin › Skenario
shows target vs simulated realization (e.g. 2031: 880 target vs ~671 simulated). Change rates in one place.

## Rules enforced server-side
- One primary CS per supplier (`cs_assignments/{supplierId}`), max 70 unique suppliers per CS; scenario CS cannot take real suppliers.
- Trial: only companies with a trial plan (`company_subscriptions.isNewCompany` + `trialYear`), Jan–Mar, max 10 unique suppliers per company for the whole window.
- `active_subscription` / `renewed` require a Platform Admin confirmation (reference + contract dates). CS cannot set paid or expired states.
- A supplier whose every lifecycle record is `expired` cannot submit reports; history and reports are kept.
- Firestore rules: CS reads only docs with its own `csId`; company admins and suppliers have no access to internal collections.

## Target project (competition setup)
Trace2Green is a competition project, so the scenario layer lives in the **same Firebase project as the app
(`trace2green`)**, next to the analytical dataset. They stay distinguishable by ID prefix (`SCN-`, `CS-S`),
`basis: "scenario_projection"`, `isProjection: true`, and the "proyeksi" labels in the UI. A separate pilot
project is only needed if the platform is later used with real customers.

## Commands
```bash
npx tsx scripts/provision.ts platform-admin <email> <password>
npx tsx scripts/provision.ts customer-success CS-001 "Name" <email> <password>
npx tsx scripts/scenario.ts --offline     # plan only
npx tsx scripts/scenario.ts               # dry run against the target DB (read-only)
```

### Apply on Windows (Git Bash), same terminal/env as the dry run
```bash
export SCENARIO_CS_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')"   # ~30 random chars, not printed
printf %s "$SCENARIO_CS_PASSWORD" | clip                               # copy → paste into a password manager now
npx tsx scripts/scenario.ts --apply --confirm-project trace2green
unset SCENARIO_CS_PASSWORD
npx tsx scripts/scenario.ts                                            # verify: 0 to create, 910 unchanged, 0 conflicts
```
All 13 scenario CS accounts (`cs01…cs13@scenario.trace2green.test`) share that password; they are demo accounts only.
The apply step is create-only and idempotent: existing docs are skipped; a differing doc is reported as a conflict and not overwritten.

Deploy rules and indexes (new composite indexes for lifecycle/scenario paging) before using the Admin/CS menus:
```bash
npx firebase deploy --only firestore:rules,firestore:indexes --project trace2green
```
