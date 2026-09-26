# GINA evaluation bundles and analytics

This folder defines **how** to package ground-truth questions + data for accuracy runs, and points to **operational** SQL for latency and cache metrics.

## What’s in the repo


| Path                                                                           | Purpose                                                                      |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `[schema/manifest.v1.schema.json](schema/manifest.v1.schema.json)`             | JSON Schema for `manifest.json` (v1)                                         |
| `[bundles/micro/](bundles/micro/)`                                             | Minimal example bundle (template — fill in real table names and gold values) |
| `[bundles/saas-eval-advanced/](bundles/saas-eval-advanced/)`                   | E-commerce-style **advanced** bundle; recorded run summary: [`bundles/saas-eval-advanced/results/result-summary.md`](bundles/saas-eval-advanced/results/result-summary.md) and [`result.json`](bundles/saas-eval-advanced/results/result.json) |
| `[scripts/validate-manifest.mjs](scripts/validate-manifest.mjs)`               | Validates manifest structure (no extra npm deps)                             |
| `[context-for-llm/GINA_EVAL_CONTEXT.md](context-for-llm/GINA_EVAL_CONTEXT.md)` | **Paste into ChatGPT, Cursor, Claude, etc.** when generating bundles         |
| `[sql/pipeline_runs_analytics.sql](sql/pipeline_runs_analytics.sql)`           | Example queries on existing `pipeline_runs` telemetry                        |
| `[sql/clear_eval_caches.sql](sql/clear_eval_caches.sql)`                       | `DELETE` both cache tables for clean eval reruns                             |
| `[Operational analytics/analytics.md](Operational%20analytics/analytics.md)` | Human-readable **operational** metrics (latency, intent mix) from `pipeline_runs` |


## Validate a manifest

From repo root:

```bash
node eval/scripts/validate-manifest.mjs eval/bundles/micro/manifest.json
# or from repo root:
npm run eval:validate-manifest -- eval/bundles/micro/manifest.json
```

## Run an eval bundle (HTTP runner)

`[scripts/run-manifest.mjs](scripts/run-manifest.mjs)` calls the real API: sync user → upload the bundle’s CSV (or reuse a dataset) → `GET /semantic` for the dynamic table name → create **one** conversation → for each case `POST /api/query` (SSE) with **empty** `sessionContext` (so cases do not depend on prior turns). It scores:

- **Intent** (optional) and **relevant_columns** (optional) from the last `step` event with `step: planner` / `status: complete` (skipped if the response came from cache with no planner step).
- **Scalar / table** expectations against the last `result` payload (`resultTable`, `chartData` for big numbers).
- `**--check-sql`**: optional token Jaccard between substituted `gold_sql` and the response `sql` (heuristic only; LLM SQL rarely matches verbatim).

**Relaxed defaults (signal on results, not labels):**


| Env                           | Default  | Meaning                                                                                                                                                                    |
| ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EVAL_CHECK_INTENT`           | unset    | Do **not** fail SQL cases on `simple_query` vs `complex_query` mismatch; report `checks.intent.skipped`. Conversational cases still require intent. Set to `1` to enforce. |
| `EVAL_CHECK_RELEVANT_COLUMNS` | unset    | Do **not** fail on column lists. Set to `1` to require every manifest column to appear in the planner’s list (**subset** match; extra planner columns OK).                 |
| `EVAL_DEFAULT_SCALAR_ABS_TOL` | `0.02`   | Used when a numeric `scalar` expectation omits `abs_tol` / `rel_tol`.                                                                                                      |
| `EVAL_DEFAULT_TABLE_ABS_TOL`  | `0.02`   | Numeric cell comparison for `table` results. Override per case with `expect.result.table_abs_tol` in the manifest.                                                         |
| `EVAL_DEBUG_SQL`              | unset    | Set to `1` so failed cases include a **longer** `responseSql` snippet in the JSON report.                                                                                  |
| `EVAL_DELAY_MS`               | `0`      | Milliseconds to wait **between** cases (not before the first). Example: `10000` for ~1 query / 10s on free-tier Groq. Reported as `evalConfig.caseDelayMs`.                |
| `EVAL_VERBOSE`                | `1` (on) | Set to `0` or `false` to **disable** step logs on stderr. The JSON report still prints to **stdout** only.                                                                 |


The JSON report includes `evalConfig` and informational `skipped` fields so you still see planner intent and columns when checks are relaxed. When a case fails and the result payload includes SQL, `checks.responseSql` is attached (truncated; longer when `EVAL_DEBUG_SQL=1`).

### Reruns and caches (`response_cache` / `narration_cache`)

The API caches answers by **dataset id + question text** (`response_cache`). After SQL runs, identical **result shapes** can reuse narration text (`narration_cache`). Re-running the same eval can skip work and hide the full planner/SQL path in telemetry.

**Options:**

1. **Dev backend:** set `**DISABLE_RESPONSE_CACHE=true`** and optionally `**DISABLE_NARRATION_CACHE=true**` in `[backend/.env](../../backend/.env)` and restart. See `[backend/.env.example](../../backend/.env.example)`. To skip per-query **schema RAG** (HF question embedding + pgvector ranking), set `**DISABLE_SCHEMA_RETRIEVAL=true**` (useful for lean eval runs).
2. **SQL:** run `[sql/clear_eval_caches.sql](sql/clear_eval_caches.sql)` (or `DELETE FROM response_cache;` only) in Supabase; TTL is **24h** otherwise.
3. **New dataset:** upload the CSV again so you get a new `dataset_id` and empty cache keys.

```bash
# Requires a running backend and a dev JWT (same idea as backend E2E scripts).
set TEST_JWT=eyJ...
set BASE_URL=http://127.0.0.1:3001
node eval/scripts/run-manifest.mjs eval/bundles/micro/manifest.json
# npm run eval:run-manifest -- eval/bundles/micro/manifest.json
```

Use `**EVAL_DATASET_ID**` or `**--dataset-id=**` to skip upload when the fixture is already loaded. The value must be the **dataset row UUID** (as in the app URL or upload response), not the Postgres table name. If you only have a table like `dataset_b1f3f4…`, the runner now accepts that string and converts it to the UUID the API expects.

Exit code **0** if every case passes, **1** otherwise. Full JSON report is printed to stdout.

## What the engineering team may add later

- In-process runner (no HTTP) for faster CI.
- Stronger SQL equivalence (AST / EXPLAIN) and `**follow_up_cache`** cases with non-empty `sessionContext`.

### Verifying gold values against Postgres (optional)

Expected scalars and `expected/*.json` tables should match the bundle CSV once it is loaded into the dynamic `dataset_<uuid>` table. You can confirm in SQL (same DB the API uses): run the substituted `gold_sql` from the manifest (replace the table placeholder with the real `schemaJson.tableName` from `GET /api/datasets/:id/semantic`), and compare to the committed JSON. This does not run automatically in CI; it is a manual hygiene step when authoring bundles.

## What you need to provide

1. **A dedicated dataset per fixture** (or one combined sheet) uploaded into a **dev** GINA workspace — note the `**dataset_id`**, dynamic `**dataset_*` table name**, and a `**conversation_id`** for API calls.
2. **Supabase JWT** (or whatever auth the API expects) for `Authorization: Bearer …` when the runner calls `POST /api/query`.
3. **Filled `manifest.json`**: replace placeholders (e.g. `gold_sql` table name, scalar expected values after you know row counts).

## Tools you can use to generate bundles

Use anything that can emit **CSV + JSON** and follow the manifest schema:


| Tool                          | How to use it                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **ChatGPT / Claude / Gemini** | Paste `[context-for-llm/GINA_EVAL_CONTEXT.md](context-for-llm/GINA_EVAL_CONTEXT.md)` + your domain brief; ask for CSV + manifest JSON. |
| **Cursor / Copilot**          | Same context file in the repo; generate files under `eval/bundles/<name>/`.                                                            |
| **Python / Node scripts**     | Use `faker`, `pandas`, or static fixtures to write CSVs; emit `manifest.json` from code.                                               |
| **Spreadsheet**               | Export CSV; hand-write or script the manifest.                                                                                         |


Always run `**node eval/scripts/validate-manifest.mjs`** before committing a bundle.

## Operational analytics (no eval bundle required)

The app writes one row to **`pipeline_runs`** per completed query (latency by stage, intent, cache flags, etc.).

- **Readable summary (sample metrics):** [`Operational analytics/analytics.md`](Operational%20analytics/analytics.md) — avg/p95 total latency, per-stage averages, intent distribution, snapshot usage (regenerate the underlying SQL anytime).
- **SQL source:** [`sql/pipeline_runs_analytics.sql`](sql/pipeline_runs_analytics.sql) — full set of queries (including cache-hit mix, fallback rate, `sql_path`). Run against Postgres (Supabase SQL editor or `psql`).

### NPM scripts (repo root)

| Script | Command |
|--------|---------|
| Validate manifest | `npm run eval:validate-manifest -- eval/bundles/<bundle>/manifest.json` |
| Run HTTP eval | `npm run eval:run-manifest -- eval/bundles/<bundle>/manifest.json` |
| Scorer unit tests | `npm run eval:test-helpers` |