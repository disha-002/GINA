# Eval run summary — `micro` bundle results

**Run finished:** 2026-04-19T11:46:23.710Z (UTC)

## Outcome

| Metric | Value |
|--------|-------|
| **Passed** | **No** (`passed: false`) |
| **Cases** | 12 total, **1 failed** |
| **Primary checks** | 7 × scalar, 4 × table, 1 × conversational (intent) |

## Run context (reproducibility)

| Field | Value |
|-------|--------|
| **API base URL** | `http://127.0.0.1:3001` |
| **Dataset ID** | `3d80baad-c861-4b6e-a479-d3ce92235a90` |
| **Postgres table** | `dataset_3d80baadc8614b6ea479d3ce92235a90` |
| **Conversation ID** | `d6ad60b2-d785-4288-892a-dec26f3cf20a` |

### Eval configuration (from report)

| Setting | Value |
|---------|--------|
| `checkIntentForSql` | `false` |
| `checkRelevantColumns` | `false` |
| `debugSql` | `true` |
| `caseDelayMs` | `10000` |

## Failure detail

| ID | Check | Issue |
|----|--------|--------|
| **q10** | `table` | `checks.table.pass` is **false**. Row count matched gold (**3** rows). Failure is **cell-level** comparison (numeric tolerance vs expected JSON) or column alias alignment—not row count. Response SQL (truncated in report): `SELECT "plan", AVG("users") … GROUP BY "plan"`. Inspect `checks` in [`result.json`](./result.json) and compare to [`../../saas-eval-basic/expected/`](../../saas-eval-basic/expected/) (or manifest paths) to adjust gold or tolerances. |

## Case-by-case results

| ID | Check | Pass | Question (short) | Notes |
|----|-------|------|------------------|--------|
| q01 | scalar | yes | Row count | — |
| q02 | scalar | yes | Total revenue | — |
| q03 | scalar | yes | Average revenue per row | Default scalar tolerance |
| q04 | table | yes | Min / max revenue | 1 row |
| q05 | scalar | yes | Rows with country India | — |
| q06 | scalar | yes | Enterprise revenue | — |
| q07 | scalar | yes | Churned customer count | — |
| q08 | scalar | yes | March 2024 revenue | — |
| q09 | table | yes | Revenue by country | 4 rows |
| q10 | table | **no** | Average users per plan | See failure detail |
| q11 | table | yes | Top 3 rows by revenue | 3 rows |
| q12 | intent | yes | SaaS churn advice (general) | Conversational |

## Scorer notes

Same rules as other bundles: [`../../../lib/scoreHelpers.mjs`](../../../lib/scoreHelpers.mjs); table cells use `table_abs_tol` (default `0.02`). Optional `column_aliases` in the manifest if API column names differ from gold JSON.

## Full machine-readable output

Sibling file: [`result.json`](./result.json).

To re-run (use the manifest that matches your dataset—here the recorded run used **`saas-eval-basic`**):

```bash
npm run eval:run-manifest -- eval/bundles/saas-eval-basic/manifest.json
```

If you maintain a separate `micro` manifest that points at the same data, point the command at that path instead.
