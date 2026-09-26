# GINA — Project OA & Full-Stack Interview Prep

Use this doc to **walk someone through the system**, **defend design choices**, and **anticipate technical depth** in a full-stack role. It maps directly to code paths in this repo (`Gina_cfp/`).

---

## 1. Elevator pitch (30–60 seconds)

**GINA** (Grounded Insight from Natural language Analytics) lets non-technical users upload a **CSV**, ask questions in **plain English**, and get answers backed by **real SQL** run on **their** data in **PostgreSQL**—with **charts**, **narration**, **auditable SQL**, and **SSE** progress in the UI. It follows **Table-Augmented Generation (TAG)**: the model plans and narrates; **numbers** come from executed queries, not from model weights alone. Auth is **Supabase (Google OAuth + JWT)**; files go to **S3** after **client-side PII redaction**; the backend is **Fastify** with a multi-step **orchestrator**, tiered **LLM fallbacks**, and **pgvector** for schema context.

---

## 2. Stack at a glance

| Layer | Technology | Where in repo |
|--------|------------|----------------|
| Frontend | Next.js 15 (App Router), React 18, Tailwind, Recharts | `frontend/` |
| Frontend auth | `@supabase/ssr`, middleware | `frontend/middleware.ts` |
| Backend | Node, **Fastify 5**, TypeScript (ESM) | `backend/src/server.ts` |
| Validation | Zod (API bodies), `node-sql-parser` (SQL AST) | `backend/src/routes/query.ts`, `backend/src/pipeline/sqlValidator.ts` |
| DB | PostgreSQL + **pgvector** (HNSW index on embeddings) | `backend/migrations/001_initial_schema.sql` |
| Auth on API | Bearer JWT → `supabase.auth.getUser(token)` (service role) | `backend/src/plugins/auth.ts` |
| Storage | AWS S3 (private bucket) | `backend/src/utils/s3.ts`, plugins |
| Streaming | **SSE** (`@fastify/sse`), `POST /api/query` | `backend/src/routes/query.ts`, `frontend/lib/api/query.ts` |
| AI | Groq (planner, SQL fallback, narrator), Hugging Face (SQL/embeddings), optional Gemini | `docs/Architecture.md`, `backend/src/pipeline/*` |
| Quality | Node test runner, manifest HTTP eval | `backend/package.json` `test`, `eval/` |

---

## 3. Request lifecycle (memorize this flow)

1. **Browser**: User signs in → JWT stored via Supabase. For `/app/*`, middleware runs `getUser()` (server-validated JWT), not spoofable cookie-only session.
2. **Upload**: PII shield runs **in the browser**; redacted CSV → backend → profiling, semantic JSON, embeddings → `dataset_{uuid}` table + `semantic_states` / `schema_embeddings`.
3. **Chat**: `streamQuery` → `POST /api/query` with `Accept: text/event-stream`, `Authorization: Bearer <jwt>`.
4. **Backend**: Zod-parse body → verify conversation belongs to `userId` + `datasetId` → `runQueryOrchestration` (orchestrator).
5. **Pipeline (high level)**: Optional **response cache** → **planner** (intent: conversational / simple / complex / follow-up from cache) → **SQL generation** (tiered) → **validate SQL** (SELECT-only, table whitelist) → **read-only execute** (row cap) → optional **secondary query** → **auto-insights** → **narration** → assemble payload → caches + DB message + **pipeline_runs** telemetry → SSE `result`.

**SSE detail**: Native `EventSource` is GET-only; the app uses `fetch` + `ReadableStream` to parse SSE over POST—common interview talking point.

---

## 4. Data model (what to draw on a whiteboard)

- `users` — mirrors Supabase `auth.users` id; no passwords here.
- `datasets` — per upload or demo; `data_table_name` points at dynamic `dataset_<uuid>` table.
- `semantic_states` — JSONB schema + understanding card; drives prompts.
- `schema_embeddings` — `vector(384)` per column; cosine / HNSW retrieval.
- `conversations` / `messages` — chat history; assistant rows store `output_payload` JSONB.
- `response_cache`, `narration_cache` — TTL-style deduplication of expensive paths.
- `pipeline_runs` — per-query latency, SQL path, fallbacks (operational analytics).

---

## 5. Security & trust (likely deep-dives)

| Topic | What you say | Grounding in code |
|--------|----------------|-------------------|
| JWT | Every `/api/*` request: Bearer token verified with Supabase **getUser** | `backend/src/plugins/auth.ts` |
| Why not `getSession()` in middleware? | Cookie session can be **spoofed** without server validation; `getUser()` validates JWT | `frontend/middleware.ts` (comment + implementation) |
| SQL injection | AST parse; only **SELECT**; **table whitelist** (active dataset table only); DB role is read-only for agent | `sqlValidator.ts`, migrations / role setup |
| PII | Two-pass detection client-side; backend never sees raw sensitive columns as shipped from browser shield path | README + Architecture; align with actual `frontend` PII modules |
| CORS | Explicit allowlist; OPTIONS must not 401 | `server.ts` + `corsOrigins` |
| Upload abuse | Size limits, multipart limits, CSV/MIME checks | `datasets` routes, `MAX_CSV_UPLOAD_BYTES` |

---

## 6. Design trade-offs (shows maturity)

- **Dynamic tables per dataset** — Simple isolation and clear SQL whitelist; downside: many tables, migration hygiene, harder cross-dataset analytics.
- **Caching** — Speed + cost; downside: eval reruns need `DISABLE_RESPONSE_CACHE` etc. (see `eval/README.md`).
- **Multiple LLM providers** — Resilience and rate limits; downside: operational complexity, non-deterministic tests without harness.
- **Hackathon scope** — Strong vertical slice; not a full metric catalog, governance, or row-level security product beyond app-level checks.

---

## 7. Files worth knowing “cold”

| If they ask about… | Open |
|---------------------|------|
| API surface & SSE registration | `backend/src/server.ts` |
| Query contract | `backend/src/routes/query.ts` |
| Full pipeline | `backend/src/pipeline/orchestrator.ts` |
| SQL safety | `backend/src/pipeline/sqlValidator.ts` |
| Planner / intents | `backend/src/pipeline/planner.ts` |
| DB execution limits | `backend/src/pipeline/dbExecutor.ts` |
| Frontend streaming | `frontend/lib/api/query.ts` |
| Route protection | `frontend/middleware.ts` |
| Env / config | `backend/src/config/env.ts` |
| Accuracy eval | `eval/README.md`, `eval/scripts/run-manifest.mjs` |

---

## 8. How to demo the project in an interview

1. **Problem**: spreadsheets + NL; need auditability.
2. **Demo path**: sign in → upload or demo dataset → ask a question → expand “how calculated” (SQL) → mention SSE steps.
3. **Trust**: TAG + validation + read-only role + visible SQL.
4. **Scale story**: caches, rate-limit queue, key pools (Architecture doc).
5. **Honesty**: external deps, eval caveats in root `README.md`.

---

## 9. Question bank by interview round

Below are **questions interviewers often ask**, tailored to **what GINA actually does**. Practice **short answer** (30s), then **deep dive** (2–3 min) if they probe.

### A. Project / system design

- What problem does this solve, and for whom?
- Walk me end-to-end from user typing a question to pixels on screen.
- Why PostgreSQL instead of answering from the LLM alone?
- What is Table-Augmented Generation, and where does it show up in your architecture?
- How would you shard or multi-tenant this for enterprise? (dynamic tables, RLS, org ids, shared warehouse)
- What happens if the SQL model returns garbage? (validation, fallbacks, empty states)
- How do you measure quality in production? (`pipeline_runs`, eval bundles, gold JSON)

### B. Frontend (React / Next.js)

- Why App Router, and how do you protect authenticated routes?
- Explain **`getUser()` vs `getSession()`** in Supabase middleware—why does it matter?
- Why is SSE implemented with `fetch` + streams instead of `EventSource`?
- How do you avoid memory leaks or duplicate subscriptions when streaming?
- How would you retry a failed stream without duplicating messages in UI state?
- How do you structure loading / error / empty states for chat?

### C. Backend & APIs

- Why Fastify over Express or a serverless function per request?
- How do you structure a long-running “pipeline” without blocking the event loop?
- How is the `/api` scope set up so SSE and auth share decorations? (nested plugin note in `server.ts`)
- How do you validate request bodies? (Zod in `query.ts`)
- How do you ensure a user cannot query another user’s dataset? (SQL in route: conversation + user_id + dataset_id)

### D. Databases & SQL

- Why **pgvector** here—what is embedded, and what query retrieves it?
- What is an HNSW index trade-off vs IVFFlat?
- How do you prevent joins to arbitrary tables from generated SQL? (whitelist in validator)
- Why a **read-only** DB role for generated SQL?
- How would you add EXPLAIN ANALYZE safely for power users?

### E. Auth & security

- Where is the JWT verified—edge, Next server, or API? (your API uses service role + `getUser(token)`)
- What is the threat model for stolen JWTs? (short TTL, HTTPS, logout, no secrets in frontend)
- How does CORS interact with credentials and PATCH requests? (`methods` in `server.ts`)

### F. AI / ML / data product

- How do you prompt the model with schema without blowing the context window? (relevant columns / planner routing)
- What is your fallback chain for SQL generation, and why ordered that way?
- When would you **not** run SQL? (`conversational`, `follow_up_cache` intents)
- How do caches change behavior for repeated questions—what are the risks?
- How would you reduce hallucinated column names? (semantic profiles, retrieval, validation failure loop)

### G. DevOps, testing, observability

- What does your CI or local test story look like? (`npm test` in backend, eval scripts)
- How does the manifest eval work at a high level? (HTTP runner, gold JSON, tolerances—`eval/README.md`)
- What metrics would you alert on from `pipeline_runs`?
- How would you blue/green deploy the API without breaking SSE connections?

### H. Behavioral / ownership

- What was the hardest bug, and how did you isolate it?
- Where did you disagree with teammates, and what was the outcome?
- What would you ship next with two more weeks?
- How did you balance demo reliability vs real pipeline? (snapshots, fallbacks—Architecture “Demo Reliability”)

---

## 10. Quick flashcard answers (cheat sheet)

| Term | One-liner |
|------|-----------|
| TAG | Ground answers in **executed** tabular results, not model memory alone. |
| Planner | Classifies intent and narrows schema/columns for downstream SQL. |
| SSE | One-way server push over HTTP; here used for `step` and `result` events. |
| Whitelist validation | Parsed SQL must reference only the active `dataset_*` table. |
| pgvector | Stores column embedding text vectors for similarity search. |
| Response cache | Keyed hash of question + dataset; skips pipeline on repeat. |

---

## 11. Related docs in this repo

- [`README.md`](../README.md) — features, setup, limitations, code map UI ↔ pipeline  
- [`Architecture.md`](Architecture.md) — topology, pipeline steps, rate limits, security table  
- [`eval/README.md`](../eval/README.md) — eval runner, env flags, cache pitfalls  
- [`GINA E2E.yaml`](GINA%20E2E.yaml) — endpoint inventory for black-box testing  

---

*Prepared from repository structure and source as of the doc author pass. Refresh numbers (eval pass counts, bundle names) from `README.md` before an interview if they change.*
