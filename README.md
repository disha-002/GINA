# GINA — Grounded Insight from Natural language Analytics

**NatWest Code for Purpose · 2026**

---

## What is GINA?

**GINA** turns plain English questions into **answers you can trust** over **your own** tabular data. A user uploads a CSV, chats in natural language, and gets **clear explanations**, **charts**, and **transparent SQL**—without writing queries or configuring dashboards.

**Intended users:** business analysts, operations teams, founders, and anyone who needs **fast answers from spreadsheets** without learning SQL or building dashboards. It is **not** aimed only at data engineers; the UI and flow are built for **non-technical** stakeholders who still need **auditable** numbers.

| Design pillar   | Description |
|-----------------|-------------|
| **Grounded**    | Numbers come from **running real SQL** on **your** dataset in PostgreSQL—not invented from model weights. We follow **Table-Augmented Generation (TAG)**: the model reasons *with* the table, not *instead* of it. |
| **Insight**     | More than a single figure: trends, breakdowns, comparisons, and optional **verification queries** when the pipeline detects explain-style questions. |
| **Natural language** | You ask in everyday language; a **planner** interprets intent, then specialist steps generate **read-only** SQL and **narration**. |
| **Analytics**   | End-to-end flow from **upload** (client-side PII handling before the network) through **semantic profiling**, **vector-backed schema context** (pgvector), **query pipeline**, and **streaming UI** feedback. |

---

## The problem

Spreadsheets hide structure. Dashboards take time to build. SQL excludes most people. Teams still need **fast, accurate answers** from operational CSVs—without a new data engineering project for every question.

**GINA** offers **conversational analytics** with **auditability** (show the SQL), **visible progress** (Server-Sent Events step trace), and **tiered fallbacks** when models disagree (Groq, Hugging Face).

---

## Implemented features (working in this repo)

These are **shipped** capabilities judges can run and click through—not a roadmap.

- **Authentication:** Sign-in with Google via Supabase OAuth; JWT on API calls.
- **Dataset upload:** CSV upload with client-side PII redaction before data leaves the browser; storage integration; semantic profiling and enrichment.
- **Chat:** Natural-language questions with **SSE** streaming (live pipeline steps: planner → SQL → execution → narration).
- **Answers:** Narrative, key figure, charts (Recharts), citation chips (“Based on”), expandable **primary/secondary SQL**, follow-up suggestions, optional insights panel with chart + **data table** view.
- **Dataset Overview:** Executive summary, highlights, and chart tiles for a dataset (async job).
- **Demo / reliability:** Demo datasets and snapshot-style flows where enabled in config.
- **Evaluation:** Manifest-based HTTP eval runner, gold JSON checks, scorer helpers, and recorded result artifacts under `eval/bundles/`.
- **Telemetry:** `pipeline_runs` logging for operational analytics (SQL in `eval/sql/pipeline_runs_analytics.sql`).

---

## How it works

1. **Sign in** — Supabase Auth (OAuth / JWT). The API verifies every request.
2. **Upload** — A **PII shield** runs in the browser before upload; redacted files go to **S3**; the backend profiles schema and builds semantic context (**pgvector**).
3. **Ask** — You type a question. The **planner** classifies complexity and routes the pipeline.
4. **Query pipeline** — **SQL generation** picks an appropriate tier (Groq for planning and narration, Hugging Face for heavier text-to-SQL when needed. SQL is **validated** and executed **read-only**.
5. **Answer** — A **narrator** turns results into prose; the UI shows **charts**, **follow-up suggestions**, and **expandable SQL** (including secondary “verification” SQL when applicable).

Design patterns (TAG-style grounding, collaborating-agent routing, tiered models) are described in [`docs/Architecture.md`](docs/Architecture.md).

---

## Usage (once the app is running)

### Web UI

1. Start **backend** (`http://localhost:3001` by default) and **frontend** (`http://localhost:3000`).
2. Open the frontend URL, **sign in**, create or select a **dataset**, open a **conversation**, and ask a question (e.g. “What is total revenue?”).
3. Watch the **Thinking** / pipeline steps, then the **answer card**. Expand **See how this was calculated** to inspect SQL and row counts.

### Query API (SSE)

The chat uses `POST /api/query` with a JSON body. Example shape (replace UUIDs and token):

```bash
curl -N -X POST "http://localhost:3001/api/query" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"conversationId":"<uuid>","datasetId":"<uuid>","question":"How many rows?","sessionContext":{"recentExchanges":[]}}'
```

The response is **Server-Sent Events**: `event: step` (progress) then `event: result` (final payload). See [`backend/src/routes/query.ts`](backend/src/routes/query.ts) for the schema.

### Accuracy eval (optional)

From repo root, with backend running and `TEST_JWT` (or your auth flow) configured per [`eval/README.md`](eval/README.md):

```bash
npm run eval:validate-manifest -- eval/bundles/saas-eval-advanced/manifest.json
npm run eval:run-manifest -- eval/bundles/saas-eval-advanced/manifest.json
```

---

## Evaluation and accuracy

The repo includes **manifest-based HTTP evals** against a running API (real planner, SQL, and results):

| Script (from repo root) | Purpose |
|---------------------------|---------|
| `npm run eval:validate-manifest -- eval/bundles/<name>/manifest.json` | Validate `manifest.json` against the JSON Schema |
| `npm run eval:run-manifest -- eval/bundles/<name>/manifest.json` | Run all cases; prints a JSON report to stdout (exit `0` if all pass) |
| `npm run eval:test-helpers` | Unit tests for numeric/table/scorer helpers |

**Recorded run — `saas-eval-advanced`:** **24 / 24** cases passed. Summary: [`eval/bundles/saas-eval-advanced/results/result-summary.md`](eval/bundles/saas-eval-advanced/results/result-summary.md); machine report: [`eval/bundles/saas-eval-advanced/results/result.json`](eval/bundles/saas-eval-advanced/results/result.json).

**Recorded run — `saas-eval-basic`** (artifacts under [`eval/bundles/micro/results/`](eval/bundles/micro/results/)): **11 / 12** passed; **q10** failed on **table** cell comparison (row count matched gold; see [`eval/bundles/micro/results/result-summary.md`](eval/bundles/micro/results/result-summary.md)). Do not claim “all bundles green” without this caveat.

**Operational metrics** (latency, intent mix, cache behaviour) come from the `pipeline_runs` table. Sample report: [`eval/Operational analytics/analytics.md`](eval/Operational%20analytics/analytics.md). Details: [`eval/README.md`](eval/README.md).

---

## Limitations and known gaps

- **External services:** Running the full stack requires **PostgreSQL/Supabase**, **S3**, and **LLM/embedding API keys** (Groq, Hugging Face, etc. as configured). Without them, features depending on those services will not work.
- **Hackathon scope:** This is a **vertical prototype**, not a full enterprise governance product (no org-wide metric catalog beyond per-dataset semantic state).
- **Eval:** The **advanced** bundle has a clean recorded run; the **basic** bundle artifact above has one **open table case** until gold/tolerance is adjusted and the report is refreshed.
- **UI vs payload:** Some telemetry fields (e.g. confidence) exist in API types but are not always surfaced in the main card; the architecture docs describe the pipeline more fully than any single screen.

**Future improvements (with more time):** stronger SQL equivalence checks in eval, broader integration tests, hardened multi-tenant review, and optional on-card display of all scoring/telemetry fields.

---

## Technology stack

| Layer | Choices |
|--------|---------|
| **Languages** | TypeScript (frontend & backend), SQL |
| **Frontend** | Next.js (App Router), React, Tailwind CSS, Recharts, Supabase (`@supabase/ssr`) |
| **Backend** | Node.js, Fastify, SSE, Zod-validated config |
| **Data & auth** | PostgreSQL + **pgvector**, Supabase Auth (JWT) |
| **Storage** | AWS S3 (uploaded CSVs) |
| **AI / ML** | Groq (planner / narrator / SQL fallback), Hugging Face (SQL tier + embeddings), optional Gemini (narration) |

**Why these choices (short):** PostgreSQL gives **real** tabular execution for grounding; **pgvector** supports schema context retrieval; **Groq/HF** fit free-tier and fast iteration for NL→SQL and narration; patterns are detailed in [`docs/Architecture.md`](docs/Architecture.md).

Full dependency lists: [`backend/package.json`](backend/package.json), [`frontend/package.json`](frontend/package.json).

---

## Repository layout

| Path | Role |
|------|------|
| `frontend/` | Next.js UI, auth, upload, chat, SSE client for `/api/query` |
| `backend/` | Fastify API, query pipeline, migrations, seeds, snapshots |
| `eval/` | Eval bundles (`manifest.json`, CSV, gold JSON), `run-manifest` / `validate-manifest`, scorer tests, operational analytics docs and SQL |
| `docs/` | Architecture, API contracts, audits, route coverage notes |

---

## Local setup

### Prerequisites

- **Node.js** 20+ and npm  
- **PostgreSQL** compatible with `backend/migrations/001_initial_schema.sql` (e.g. Supabase)  
- **`psql`** on your PATH for `npm run migrate`

### Clone

```bash
git clone https://github.com/vanshGupta18/Gina_cfp.git
cd Gina_cfp
```

### Backend

```bash
cd backend
cp .env.example .env
# Fill DATABASE_URL, Supabase, AWS, HF, Groq, Gemini — see docs
npm install
npm run migrate    # requires psql; reads backend/.env
npm run dev        # default http://localhost:3001
```

- **Production:** `npm run build && npm start`  
- **Tests:** `npm test`  

Env validation: `backend/src/config/env.ts`

### Frontend

```bash
cd ../frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_BASE_URL → backend (e.g. http://localhost:3001)
# NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev        # http://localhost:3000
```

- **Production:** `npm run build && npm start`

---

## Code map: UI ↔ pipeline

1. [`ChatInput`](frontend/components/chat/ChatInput.tsx) builds [`QueryPayload`](frontend/types/index.ts).  
2. [`streamQuery`](frontend/lib/api/query.ts) → `POST /api/query` with JWT; response is **SSE**.  
3. `event: step` → [`usePipeline`](frontend/lib/hooks/usePipeline.ts) / [`PipelineStep`](frontend/components/chat/PipelineStep.tsx).  
4. `event: result` → narrative, chart, SQL, optional secondary SQL, follow-ups.  
5. [`OutputCard`](frontend/components/output/OutputCard.tsx) + [`SQLExpand`](frontend/components/output/SQLExpand.tsx) for answers and SQL.  

Backend: planner → SQL (Groq / HF) → validate → read-only execute → optional secondary query → narration

---

## Licensing and contributions

- **License:** [Apache License 2.0](LICENSE).
- **Sign-off:** See [CONTRIBUTING.md](CONTRIBUTING.md) for DCO / `git commit -s` expectations aligned with hackathon rules.

---

## Documentation

| Document | Contents |
|----------|----------|
| [`docs/Architecture.md`](docs/Architecture.md) | Topology, patterns, layers |
| [`eval/README.md`](eval/README.md) | Eval bundles, env flags, caches, NPM scripts |
| [`eval/bundles/saas-eval-advanced/results/result-summary.md`](eval/bundles/saas-eval-advanced/results/result-summary.md) | Recorded advanced accuracy run (24-case bundle) |
| [`eval/bundles/micro/results/result-summary.md`](eval/bundles/micro/results/result-summary.md) | Recorded basic bundle run (11/12 in stored artifact) |
| [`eval/Operational analytics/analytics.md`](eval/Operational%20analytics/analytics.md) | Sample `pipeline_runs` metrics (latency, intent mix) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | DCO / commit sign-off |
