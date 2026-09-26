# Context for external tools (LLMs, generators) — GINA evaluation bundles

Paste this file (or link it) when asking a tool to **generate CSV fixtures + `manifest.json`** for the GINA project.

## What GINA is

- **GINA** is a web app: users upload a spreadsheet (CSV/XLSX), the backend profiles columns, stores data in **PostgreSQL** under a dynamic table name like `dataset_<uuid_slug>`, and answers **natural-language questions** via an LLM planner + SQL generation + execution + narration.
- **Column names** in SQL match the **spreadsheet headers** after profiling (spaces and punctuation may require **double-quoted identifiers** in PostgreSQL, e.g. `"Math score"`).
- **Semantic types** include: `amount`, `date`, `category`, `identifier`, `flag`, `text`.

## What you must output

1. **One or more CSV files** — realistic rows; first row = headers. Keep column names stable; they become the evaluation ground truth for “which column” questions.
2. **`manifest.json`** — must conform to **eval bundle v1** (see [`../schema/manifest.v1.schema.json`](../schema/manifest.v1.schema.json) and [`../README.md`](../README.md)).

## Per test case, provide

- **`question`**: natural language, as a user would type it.
- **`expect.intent`**: one of `conversational` | `simple_query` | `complex_query` | `follow_up_cache` (usually `simple_query` or `complex_query` for SQL).
- **`expect.relevant_columns`**: array of **exact header strings** as they appear in the CSV (these map to DB column names).
- **`expect.gold_sql`**: a **single SELECT** that answers the question against the dynamic table. Replace the table name with placeholder `dataset_<FIXTURE_TABLE>` — the human/runner will substitute the real `dataset_*` name after upload.
- **`expect.result`** (use **`type`** discriminator):
  - **`scalar`**: `{ "type": "scalar", "value": <number|string|boolean>, "abs_tol"?, "rel_tol"? }`
  - **`table`**: `{ "type": "table", "path": "<relative path>", "row_order_matters"?: false }`
  - **`conversational`**: `{ "type": "conversational", "narrative_contains"?: ["optional", "keywords"] }`

## Pitfalls to avoid

- Do not assume **snake_case** column names unless your CSV headers are snake_case.
- **COUNT(*)** / aggregates: gold result must match what Postgres returns for the uploaded data.
- Questions that are **ambiguous** make poor eval cases; prefer clear, verifiable questions.

## Suggested coverage (for a full bundle)

- Aggregations: sum, avg, min, max, count rows.
- Filters: equality, range, date range.
- Group by / top-N.
- One **conversational** off-topic case (expect `conversational` intent).
- Optional: trend / multi-step (complex_query).
