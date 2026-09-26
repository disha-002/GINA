# Eval run summary — `saas-eval-advanced`

**Run finished:** 2026-04-19T11:04:44.551Z (UTC)

## Outcome

| Metric | Value |
|--------|-------|
| **Passed** | **Yes** (`passed: true`) |
| **Cases** | 24 total, 0 failed |
| **Primary checks** | 15 × scalar, 8 × table, 1 × conversational (intent) |

## Run context (reproducibility)

These IDs refer to a **dev** dataset and conversation used by the HTTP runner; they are not secrets.

| Field | Value |
|-------|--------|
| **API base URL** | `http://127.0.0.1:3001` |
| **Dataset ID** | `f605983c-a5ee-49fc-8bfc-0e949d53e80e` |
| **Postgres table** | `dataset_f605983ca5ee49fc8bfc0e949d53e80e` |
| **Conversation ID** | `c4950367-044d-492a-8ebc-1298802a2cf3` |

### Eval configuration (from report)

| Setting | Value |
|---------|--------|
| `checkIntentForSql` | `false` — SQL cases do **not** fail on `simple_query` vs `complex_query` mismatch (reported under `checks.intent.skipped`) |
| `checkRelevantColumns` | `false` — column lists are **not** enforced as pass/fail (reported under `checks.relevant_columns.skipped`) |
| `debugSql` | `true` — longer SQL snippets on failures |
| `caseDelayMs` | `10000` — delay between cases (e.g. free-tier rate limits) |

Conversational case **q24** still requires correct **intent** (`conversational`).

## Case-by-case results

| ID | Check | Pass | Question (short) | Notes |
|----|-------|------|------------------|--------|
| q01 | scalar | yes | Order count | — |
| q02 | scalar | yes | Total revenue | — |
| q03 | scalar | yes | Average revenue per order | Default scalar tolerance |
| q04 | scalar | yes | Minimum price | — |
| q05 | scalar | yes | Max discount % | — |
| q06 | scalar | yes | UK orders | — |
| q07 | scalar | yes | February 2024 orders | — |
| q08 | scalar | yes | Discount > 20% count | — |
| q09 | scalar | yes | Orders not returned | — |
| q10 | scalar | yes | Orders returned | — |
| q11 | table | yes | Revenue by country | Row count + gold table |
| q12 | table | yes | Revenue by category | — |
| q13 | table | yes | Avg revenue by category | — |
| q14 | table | yes | Quantity by category | — |
| q15 | table | yes | Top 5 orders by revenue | — |
| q16 | table | yes | Top 3 countries by revenue | — |
| q17 | table | yes | Top 5 categories by quantity | — |
| q18 | scalar | yes | Electronics revenue in US | — |
| q19 | scalar | yes | Avg discount (returned) | — |
| q20 | scalar | yes | Quantity & discount filter count | — |
| q21 | scalar | yes | Avg revenue per unit | — |
| q22 | scalar | yes | % orders returned | Gold 0–100 vs API fraction: manifest uses `compare_as: fraction_as_percent` (see scorer) |
| q23 | table | yes | Avg discount by category | — |
| q24 | intent | yes | Cart abandonment (general) | Non-data conversational |

## Scorer notes

- **Table rows:** Numeric cells compared with `table_abs_tol` (default `0.02` unless overridden). Column names in gold JSON may differ from API column aliases via built-in synonym groups and optional `expect.result.column_aliases` in the manifest. See [`../../../lib/scoreHelpers.mjs`](../../../lib/scoreHelpers.mjs).
- **Scalars:** Optional `compare_as: fraction_as_percent` when gold is 0–100 and the model returns 0–1 (q22). See [`../../../README.md`](../../../README.md).

## Full machine-readable output

Sibling file: [`result.json`](./result.json) (complete JSON report from `run-manifest`).

To re-run:

```bash
npm run eval:run-manifest -- eval/bundles/saas-eval-advanced/manifest.json
```

Validate manifest:

```bash
npm run eval:validate-manifest -- eval/bundles/saas-eval-advanced/manifest.json
```
