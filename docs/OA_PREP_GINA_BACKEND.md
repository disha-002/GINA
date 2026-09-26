# GINA — OA Preparation (Product Detail, Tech Stack, Backend Role)

This document is for **project discussions** and **on-site / take-home style reviews**. Tailor the “Your contribution” bullets at the end to match **what you actually built or owned** (commits, PRs, incidents you fixed).

---

## 1. What is GINA? (Detailed)

### 1.1 Name and positioning

**GINA** stands for **Grounded Insight from Natural language Analytics**. It is a **conversational analytics** product built for **NatWest Code for Purpose (2026)**.

The core promise: users who are **not SQL experts** can upload **their own tabular data** (typically CSV), ask questions in **natural language**, and receive answers that are **grounded in real database execution**—not free‑floating LLM guesses.

### 1.2 The problem it solves

- **Spreadsheets** are everywhere but **structure and meaning** are implicit (column names alone are weak signals).
- **Dashboards** take time to design and maintain.
- **SQL** excludes most business stakeholders, yet they still need **correct numbers** quickly for decisions.

GINA reduces the gap: **ask in English → see the number, chart, and explanation → inspect the SQL** when you need auditability.

### 1.3 Who it is for

Primary audience: **analysts, ops, founders, and generalists** who live in CSVs and meetings—not only data engineers. The UX assumes **low technical fluency** but a need for **trust** (visible reasoning steps and SQL).

### 1.4 Design pillars (how the product “feels” defensible)

| Pillar | Meaning in practice |
|--------|---------------------|
| **Grounded** | Aggregates and breakdowns come from **running PostgreSQL `SELECT`s** on the user’s dataset table. The system follows **Table‑Augmented Generation (TAG)** thinking: models **plan and narrate around** tabular evidence; they do not replace the database as the source of numeric truth. |
| **Insight** | Answers can include **key figures**, **charts**, **citations** (“based on which fields”), **follow‑up suggestions**, and—when the question is explanatory—**optional secondary SQL** to surface drivers of change. |
| **Natural language** | A **planner** step interprets **intent** (e.g. small talk vs real query vs follow‑up using prior results) before expensive SQL work. |
| **Analytics** | End‑to‑end: **upload → semantic profiling → embeddings (pgvector) → query pipeline → streamed progress (SSE) → persisted messages and telemetry**. |

### 1.5 Major user-visible capabilities (as implemented in this repo)

- **Authentication:** Google sign‑in via **Supabase Auth**; API calls carry a **JWT**.
- **Dataset lifecycle:** Upload (with **client-side PII redaction** before network), optional **demo datasets**, **semantic state** (column profiles, labels, samples), **schema embeddings** for retrieval.
- **Chat:** **Server‑Sent Events (SSE)** so the UI shows **live pipeline steps** (e.g. planner complete, SQL generated, DB finished, narration).
- **Answers:** Narrative, **Recharts**‑style chart payloads from the backend, **expandable SQL**, optional **secondary query** path, **follow‑ups**, **dataset overview** job for summary tiles.
- **Reliability / demo:** Configurable **snapshot** flows and a **tiered LLM fallback** story when a provider is slow or rate‑limited.
- **Quality and ops:** **Manifest-based HTTP evaluation** against a running API; **`pipeline_runs`** table for latency, cache hits, SQL path, fallbacks.

### 1.6 How a single question flows (backend-centric view)

1. **Frontend** sends `POST /api/query` with `conversationId`, `datasetId`, `question`, optional `sessionContext` (recent Q/A, last result set), plus **`Authorization: Bearer <JWT>`**.
2. **API** validates the body (e.g. with **Zod**), loads the **conversation** scoped to **the authenticated user and dataset** (prevents cross‑tenant access by ID guessing).
3. **Orchestrator** may short‑circuit via **response cache** (same question + dataset).
4. **Schema RAG** (unless `DISABLE_SCHEMA_RETRIEVAL`): embed the question with the same HF model as column embeddings, query **`schema_embeddings`** with pgvector, and **reorder** the full `ColumnProfile` list so the closest columns appear first in planner and SQL prompts (no columns removed).
5. **Planner** (LLM) returns **intent** and **relevant columns/tables** for prompting downstream steps; some intents skip SQL entirely or reuse cached rows.
6. **SQL generation** tries **ordered tiers** (e.g. dedicated SQL model / HF / generalist) until valid SQL is produced or a controlled failure path runs.
7. **SQL validation** parses the AST (**`node-sql-parser`**), enforces **single `SELECT`**, and **whitelists** table references to the active **`dataset_<uuid>`** table only.
8. **Execution** uses a **read‑only** DB role (`readonly_agent` in migrations), with **row limits** and safe handling of empty or error results.
9. **Secondary query** (conditional) for “why / what drove” style questions when numeric deltas exceed a threshold.
10. **Auto‑insights** heuristics on the result set; **narration** LLM turns rows + context into short prose.
11. **Persistence:** assistant message + **`output_payload`**, cache rows, **`pipeline_runs`** telemetry; client receives final **`result`** SSE event.

This flow is the main story for OAs: **security boundaries**, **grounding**, **observability**, and **graceful degradation**.

---

## 2. Technologies used

### 2.1 Languages and runtime

| Area | Technology |
|------|------------|
| Application code | **TypeScript** (frontend and backend) |
| Backend runtime | **Node.js** (ES modules: `"type": "module"` in backend `package.json`) |
| Database | **SQL** (PostgreSQL), **pgvector** extension |

### 2.2 Frontend (`frontend/`)

| Concern | Technology |
|---------|------------|
| Framework | **Next.js 15** (App Router), **React 18** |
| Styling | **Tailwind CSS** |
| Charts | **Recharts** |
| Auth session in browser / server components | **`@supabase/ssr`**, **`@supabase/supabase-js`** |
| Route protection | **`middleware.ts`** — uses **`supabase.auth.getUser()`** (JWT validated server‑side), not spoofable cookie‑only session |
| CSV / workbook parsing (client) | **Papa Parse**, **SheetJS (xlsx)** (as in dependency list) |
| Long‑running query UX | **`fetch` + `ReadableStream`** parsing **SSE** from `POST /api/query` (EventSource is GET‑only) |

### 2.3 Backend (`backend/`)

| Concern | Technology |
|---------|------------|
| HTTP server | **Fastify 5** |
| Streaming | **`@fastify/sse`** for SSE from **`POST /api/query`** |
| Multipart uploads | **`@fastify/multipart`** |
| CORS | **`@fastify/cors`** (explicit origins; methods include PATCH for semantic PATCH) |
| Config / env | **Zod**‑validated env (`src/config/env.ts`) |
| PostgreSQL client | **`pg`** |
| Vector types | **`pgvector`** npm package alongside DB extension |
| Object storage | **AWS SDK v3** (`@aws-sdk/client-s3`) |
| Auth verification | **`@supabase/supabase-js`** with **service role** + **`auth.getUser(jwt)`** on each request |
| LLM / ML APIs | **Groq SDK**, **Hugging Face Inference**, **Google GenAI** (optional narrator path) |
| SQL safety | **`node-sql-parser`** (AST, statement type, referenced tables) |
| CSV parsing (server) | **Papa Parse** (and xlsx where applicable) |

### 2.4 Data platform and infrastructure (conceptual)

| Concern | Technology |
|---------|------------|
| Primary database | **PostgreSQL** (e.g. **Supabase**‑hosted in typical setups) |
| Auth provider | **Supabase Auth** (OAuth / JWT) |
| File storage for uploads | **Amazon S3** (private objects; backend‑mediated access) |
| Optional self‑hosted inference | Documented in **`docs/Architecture.md`** (e.g. SQL model on **EC2**) — depends on deployment |

### 2.5 Quality, evaluation, and tooling

| Concern | Technology |
|---------|------------|
| Backend unit / integration tests | **Node test runner** (`node --test`) with **tsx** + **dotenv** (see `backend/package.json` `test` script) |
| HTTP accuracy eval | **Node** scripts under **`eval/scripts/`** (manifest validation + run against live API) |
| API contract / E2E catalog | **`docs/GINA E2E.yaml`** (OpenAPI‑style catalog of covered routes) |

---

## 3. Backend engineer role on this project

The repository splits clearly: **`frontend/`** (Next.js) vs **`backend/`** (Fastify API, pipeline, DB, S3, LLM orchestration). As a **backend engineer**, your OA narrative should center on **everything behind the browser except static assets**—especially **trust, data, and orchestration**.

### 3.1 What “backend” owns in GINA (by subsystem)

Use this as a **checklist** of topics you can speak to in depth. **Mark the bullets you personally implemented, reviewed, or operated** before the interview.

#### API surface and server lifecycle

- **Fastify app wiring:** health check, CORS, multipart limits, DB and S3 plugins, **`/api` prefix** and nested registration so **SSE + auth** work in the same scope (`backend/src/server.ts`).
- **REST / JSON routes:** users sync, datasets (list, upload, semantic GET/PATCH), conversations, messages, snapshot toggle (`backend/src/routes/*.ts`).
- **Streaming query endpoint:** `POST /api/query` with Zod body validation and conversation ownership SQL (`backend/src/routes/query.ts`).

#### Authentication and authorization

- **Bearer JWT extraction** and **Supabase `getUser(token)`** verification on every `/api/*` request (`backend/src/plugins/auth.ts`).
- **Resource checks** so users cannot attach to another user’s conversation/dataset (see parameterized SQL in `query.ts` and analogous patterns in other routes).

#### Core query pipeline (the product engine)

- **Orchestration** of planner → SQL → validate → execute → secondary query → insights → narration → persistence + SSE events (`backend/src/pipeline/orchestrator.ts` and imports).
- **Planner** output: intents, column routing, grounding guardrails (`planner.ts`, `plannerGroundingGuard.ts`).
- **SQL generation** with tiered providers and timeouts (`sqlGenerator.ts`).
- **SQL validation** and table whitelist (`sqlValidator.ts`).
- **Read‑only execution**, row caps, error/empty handling (`dbExecutor.ts`).
- **Caching** for responses and narration (`cache/responseCache.ts`, `cache/narrationCache.ts`).
- **Telemetry** for operational learning (`telemetry/pipelineLogger.ts`, `pipeline_runs` table).

#### Semantic layer and ingestion

- **Profiling / enrichment** of uploaded tables into `semantic_states` (`semantic/profiler.ts`, `enricher.ts`, `mergeProfile.ts`).
- **Embeddings** and **per-query vector ranking** (`semantic/embedder.ts`, `semantic/retriever.ts`, `semantic/orderColumnsByRetrieval.ts`) — wired in **`pipeline/orchestrator.ts`** before the planner; optional **`DISABLE_SCHEMA_RETRIEVAL`** / **`SCHEMA_RETRIEVAL_TOP_K`** in env.
- **Upload ingestion** path: parse, dynamic table naming, row/column counts (`utils/uploadIngestion.ts`, `ingestion/parseUploadFile.ts`, `utils/datasetNaming.ts`).

#### Storage and integrations

- **S3** put/get patterns and configuration (`plugins/s3.ts`, `utils/s3.ts`).
- **Rate limiting / key pools** for external APIs where implemented (`ratelimit/queue.ts`, `ratelimit/keyPool.ts`).

#### Database schema and migrations

- **DDL** for users, datasets, semantic state, embeddings (with **HNSW** index), conversations, messages, caches, telemetry (`backend/migrations/001_initial_schema.sql`).
- **`readonly_agent` role** and `GRANT SELECT` pattern for safe generated SQL execution (same migration file).

#### Reliability and demo modes

- **Snapshot** store and toggle API for scripted demos (`snapshots/*`, `routes/snapshot.ts`).

#### Evaluation and backend-adjacent quality

- **Manifest runner** and scoring assumptions (tolerances, cache pitfalls) — valuable if you owned accuracy or CI (`eval/README.md`, `eval/scripts/*`).
- **Backend tests** for SQL security, CORS, upload limits, cache concurrency, etc. (`backend/src/tests/*`).

### 3.2 How to describe your role in one paragraph (template)

> On GINA I worked on the **backend API and query pipeline**. I was responsible for **[pick: Fastify routes / JWT auth plugin / orchestrator steps / SQL validation & read‑only execution / PostgreSQL schema & migrations / S3 upload pipeline / semantic profiling & pgvector / telemetry & caches / eval harness / tests]**. That meant ensuring **[security: JWT verification + per-request resource checks]**, **[correctness: validated SELECT-only SQL against the dataset table]**, and **[operability: SSE streaming, fallbacks, and pipeline_runs logging]** so the frontend could stay thin and the product remained auditable for non‑technical users.

Replace the bracketed phrases with **your** truth.

### 3.3 Differentiation from “full stack” or “frontend” on this team

- **Frontend engineer** narrative: Next.js pages, chat UI, SSE consumer, upload UX, PII shield in the browser, Recharts binding.
- **Backend engineer** narrative: **everything in section 3.1**—especially **authZ on resources**, **SQL safety**, **DB roles**, **pipeline ordering**, **caching semantics**, and **integration with external LLM and storage providers**.

### 3.4 Suggested OA prep steps for you

1. List **3–5 files** you changed most often; be ready to open them mentally and explain one function each.
2. Rehearse **one failure story**: invalid SQL, rate limit, empty result, or cache confusion—and what you logged or fixed.
3. Skim **`docs/Architecture.md`** once for the **topology diagram** and **fallback chain** wording.

---

## 4. Related documents

| Document | Use |
|----------|-----|
| [`README.md`](../README.md) | Features, setup, limitations, high-level code map |
| [`Architecture.md`](Architecture.md) | Topology, pipeline steps, rate limits, security table |
| [`INTERVIEW_PREP.md`](INTERVIEW_PREP.md) | Interview-style question bank and flashcards |

---

*Generated from the GINA codebase layout and shipped README/Architecture. Personalize section 3.2 with your real ownership before the OA.*
