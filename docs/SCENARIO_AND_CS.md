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

## Rules enforced server-side
- One primary CS per supplier (`cs_assignments/{supplierId}`), max 70 unique suppliers per CS; scenario CS cannot take real suppliers.
- Trial: only companies with a trial plan (`company_subscriptions.isNewCompany` + `trialYear`), Jan–Mar, max 10 unique suppliers per company for the whole window.
- `active_subscription` / `renewed` require a Platform Admin confirmation (reference + contract dates). CS cannot set paid or expired states.
- A supplier whose every lifecycle record is `expired` cannot submit reports; history and reports are kept.
- Firestore rules: CS reads only docs with its own `csId`; company admins and suppliers have no access to internal collections.

## Commands
```bash
npx tsx scripts/provision.ts platform-admin <email> <password>
npx tsx scripts/provision.ts customer-success CS-001 "Name" <email> <password>
npx tsx scripts/scenario.ts --offline     # plan only
npx tsx scripts/scenario.ts               # dry run against the target DB (read-only)
SCENARIO_CS_PASSWORD=... npx tsx scripts/scenario.ts --apply --confirm-project <projectId>
```
The apply step is create-only and idempotent: existing docs are skipped; a differing doc is reported as a conflict and not overwritten.
Deploy `firestore.rules` and `firestore.indexes.json` (new composite indexes for lifecycle/scenario paging) before use.
