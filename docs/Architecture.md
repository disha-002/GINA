# GINA — Architecture

*NatWest Code for Purpose Hackathon*

---

## System Overview

GINA enables non-technical users to ask natural language questions about their own CSV data and receive instant, plain English answers grounded in real SQL execution. No SQL knowledge required. No dashboards to configure.

The architecture follows three validated reference patterns:
- **TAG (Table-Augmented Generation)** — UC Berkeley / Stanford: ground LLM answers in real table data, not model weights
- **Microsoft Collaborating Agents** — two specialist agents (schema router + SQL generator) rather than one general model
- **AWS Bedrock text-to-SQL** — right model for each job; domain specialist for SQL, fast generalist for routing

---

## Deployment Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│  USER BROWSER                                                       │
│  Next.js (Vercel)                                                   │
│  · PII Shield (TypeScript, runs before any network call)            │
│  · Chat UI + SSE consumer                                           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │  HTTPS + JWT (Supabase)
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│  LINUX SERVER                                                       │
│  ┌─────────────────────┐                                            │
│  │  Fastify (Node.js)  │◄─── connects via DATABASE_URL ────┐       │
│  │  Pipeline API       │                                   │       │
│  │  SSE streaming      │                                   │       │
│  └─────────────────────┘                                   │       │
└──────────────────────────┬─────────────────────────────────┼────────┘
                           │                                 │
                           │    ┌────────────────────────────▼───────┐
                           │    │  Supabase PostgreSQL + pgvector   │
                           │    │  · User data tables               │
                           │    │  · Schema embeddings              │
                           │    │  · Conversations + messages       │
                           │    │  · Response + narration cache     │
                           │    │  · Pipeline telemetry             │
                           │    └───────────────────────────────────┘
                           │
          ┌────────────────┼──────────────────────┐
          │                │                      │
┌─────────▼──────┐ ┌───────▼──────┐  ┌───────────▼──────────┐
│  EC2 Instance  │ │  Groq (free) │  │  Google AI Studio    │
│  SQLCoder-8B   │ │  Llama 4    │  │  Gemini 2.5 Flash    │
│  (primary SQL) │ │  Scout 17B   │  │  (demo narrator)     │
└─────────┬──────┘ │  (planner)   │  └──────────────────────┘
          │ fail   │  Llama 4     │
          │        │  Maverick 17B│
┌─────────▼──────┐ │  (narrator   │
│  HuggingFace   │ │   fallback + │
│  SQLCoder-8B   │ │   SQL last   │
│  API (fallback)│ │   resort)    │
└────────────────┘ └──────────────┘
└────────────────┘


                           ┌──────────────┐
                           │  AWS S3      │
                           │  Redacted    │
                           │  CSV storage │
                           └──────────────┘

                           ┌──────────────┐
                           │  Supabase    │
                           │  Auth +      │
                           │  PostgreSQL  │
                           │  (OAuth/JWT) │
                           └──────────────┘
```

---

## Layer 1 — Frontend (Vercel)

**Technology:** Next.js 14 (App Router) + Tailwind CSS + Recharts + TypeScript

**Auth library:** `@supabase/ssr` (`createBrowserClient` for client, `createServerClient` for server/middleware). Note: `@supabase/auth-helpers-nextjs` is deprecated and must not be used.

**Responsibilities:**
- Hosts all user-facing UI (landing, auth, chat, upload)
- Runs PII shield entirely client-side — no raw PII ever leaves the browser
- Consumes SSE stream from backend for real-time pipeline progress
- Manages auth session via Supabase JWT — middleware uses `getUser()` (JWT-validated) not `getSession()` (spoofable)
- Stores reasoning toggle preference in sessionStorage

**Key interactions:**
- Upload: strips PII → POSTs redacted CSV to backend
- Query: POSTs question → reads SSE stream → renders step-by-step trace → renders output card
- Auth: Supabase OAuth → JWT attached to every backend API call

PII detection runs two passes before any upload:
1. Column header heuristics (name, email, phone, nino, sort_code, NI number, etc.)
2. Regex on first 50 rows per column (email format, UK phone, UK postcode, UUID, sort code, NI number `[A-Z]{2}\d{6}[A-Z]`, account number)

---

## Layer 2 — Backend (Linux Server · Fastify)

**Technology:** Node.js + Fastify + pg + AWS SDK + Supabase JS

**Responsibilities:**
- Orchestrates the full query pipeline
- Manages all LLM provider calls with fallback chain
- Executes validated SQL against PostgreSQL under read-only role
- Streams pipeline progress to the browser via SSE
- Manages semantic states, schema embeddings, caches, telemetry

### Pipeline Orchestration — Step by Step

Every user question goes through this sequence:

```
User question
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  STEP 1: Merged Planner + Agent 1                   │
│  Model: Groq Llama 4 Scout 17B                      │
│  Input: question + last 3 exchanges + result set    │
│         + compact schema (all column descriptions)  │
│  Output: { intent, relevantColumns, relevantTables, │
│            answerFromCache }                        │
│                                                     │
│  Intent options:                                    │
│  · conversational  → answer directly, no SQL        │
│  · simple_query    → single SQL path                │
│  · complex_query   → SQL + possible secondary query │
│  · follow_up_cache → answer from cached result set  │
└──────────────────────────┬──────────────────────────┘
                           │
          ┌────────────────┼─────────────────────┐
          │ conversational │ follow_up_cache      │ simple/complex
          ▼                ▼                     ▼
    Direct reply    Narrator uses         Continue pipeline
    (no SQL)        cached rows
                    (no new SQL)
                           │
     ──────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  STEP 2: SQL Generation — Agent 2                   │
│  Tier 1: EC2 SQLCoder-8B          timeout: 3s       │
│  Tier 2: HuggingFace SQLCoder-8B  timeout: 8s       │
│  Tier 3: Groq Llama 4 Maverick    timeout: 5s       │
│                                                     │
│  Input: question + full schema for relevant tables  │
│         only + metric dictionary                    │
│  Output: PostgreSQL SELECT statement                │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  STEP 3: SQL Validation                             │
│  · Parse with node-sql-parser (AST check)           │
│  · Assert statement type = SELECT                   │
│  · Assert table = active dataset table only         │
│  · If invalid → escalate to next SQL tier           │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  STEP 4: DB Execution                               │
│  · Read-only PostgreSQL role                        │
│  · Parameterised queries                            │
│  · Max 100 rows returned                            │
│  · 0 rows → empty state response                    │
│  · Runtime error → template fallback                │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  STEP 5: Secondary Query (conditional)              │
│  Fires only when BOTH:                              │
│  · Primary result has numeric delta > 5%            │
│  · Question contains: why / what caused / what drove│
│    / what changed / what contributed                │
│                                                     │
│  Runs: GROUP BY on most relevant category column    │
│  → surfaces biggest contributor to the change       │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  STEP 6: AutoInsight Rules                          │
│  Fires on result set before narration:              │
│  · Concentration: top item > 50% of total           │
│  · Trend: consistent direction across ≥3 periods    │
│  · Anomaly: value > 2 std deviations from mean      │
│  · Contradiction: paired amount columns diverge     │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  STEP 7: Narrator                                   │
│  Dev:  Groq Llama 4 Maverick                        │
│  Demo: Gemini 2.5 Flash (primary)                   │
│        Groq Maverick (fallback)                     │
│                                                     │
│  Primary + secondary results batched into ONE call  │
│  Input: result rows + question + autoInsights +     │
│         understandingCard + persona context         │
│  Output: 2–3 sentence plain English narrative       │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  STEP 8: Output Assembly + Cache Write              │
│  · Select chart type from result shape              │
│  · Build citation chips from relevantColumns        │
│  · Compute confidence score (0–100 heuristic)       │
│  · Generate follow-up suggestions                   │
│  · Write to response_cache + narration_cache        │
│  · Persist message + output_payload to PostgreSQL   │
│  · Emit SSE result event to browser                 │
└─────────────────────────────────────────────────────┘
```

---

## Layer 3 — Semantic Layer (always-on trust engine)

The semantic layer ensures every SQL query runs with full business context — not just raw column names and types.

```
┌───────────────────────────────────────────────────────────┐
│  SEMANTIC STATE (per dataset)                             │
│                                                           │
│  columns: [                                               │
│    {                                                      │
│      columnName: "amount",                                │
│      businessLabel: "Net Disbursement (GBP)",             │
│      semanticType: "amount",                              │
│      currency: "GBP",                                     │
│      description: "Net grant expense after fees",         │
│      sampleValues: ["1200.00", "340.50"],                 │
│      nullPct: 0,                                          │
│      valueRange: { min: "50.00", max: "8400.00" }         │
│    },                                                     │
│    ...                                                    │
│  ]                                                        │
└───────────────────────────────────────────────────────────┘
         │                              │
         │ injected into                │ embedded into
         ▼                              ▼
  Agent 1 + Agent 2 prompts      pgvector (schema_embeddings)
  (metric dictionary context)    (cosine similarity retrieval
                                  for relevant column selection)
```

**Two modes:**
| | Demo datasets | Arbitrary CSV uploads |
|---|---|---|
| **Source** | Pre-authored YAML files | Auto-generated by profiler + LLM enrichment |
| **Accuracy** | Fully validated, zero inference | LLM-inferred, correctable by user |
| **Speed** | Instant (loaded from YAML) | ~3s (profiler + 1 LLM call + embeddings) |

---

## Data Flow — Full Request Lifecycle

```
Browser (user types question)
   │
   │  POST /api/query { conversationId, datasetId, question, sessionContext }
   │  Authorization: Bearer <Supabase JWT>
   │
   ▼
Fastify (Linux server)
   │
   ├─ Verify JWT via Supabase service role
   ├─ Check response_cache (hash: SHA256(question + datasetId))
   │     └─ Cache HIT → skip to narrator → emit result
   │
   ├─ Emit SSE: step "schema_retrieval" running (unless DISABLE_SCHEMA_RETRIEVAL)
   ├─ HF embedding(question) + pgvector: rank schema_embeddings → reorder full ColumnProfile list
   │     (RAG-ranked columns first; same columns as semantic_state — none dropped)
   ├─ Emit SSE: step "schema_retrieval" complete (or warning → original order)
   │
   ├─ Emit SSE: step "planner" running
   ├─ Groq Llama 4 Scout: classify intent + pick relevant columns/tables from ordered schema JSON
   ├─ Emit SSE: step "planner" complete
   │
   ├─ [if conversational] respond directly, done
   ├─ [if follow_up_cache] pass cached rows to narrator, skip SQL
   │
   ├─ Emit SSE: step "sql_generation" running
   ├─ Agent 2: EC2 SQLCoder → HF SQLCoder → Groq Maverick
   ├─ SQL validator: AST parse, SELECT-only assertion, table whitelist
   ├─ Emit SSE: step "sql_generation" complete (or "sql_fallback" warning)
   │
   ├─ Emit SSE: step "db_execution" running
   ├─ PostgreSQL (read-only role): execute SQL, return rows
   ├─ Emit SSE: step "db_execution" complete
   │
   ├─ [if secondary conditions met] Emit SSE: step "secondary_query"
   ├─ AutoInsight rules fire on result set
   │
   ├─ Emit SSE: step "narration" running
   ├─ Narrator (Gemini Flash / Groq Maverick): generate plain English
   ├─ Assemble output payload
   ├─ Write caches, persist message to DB, log to pipeline_runs
   │
   └─ Emit SSE: result { narrative, chartType, chartData, keyFigure,
                         citationChips, sql, confidenceScore,
                         followUpSuggestions, autoInsights, ... }

Browser
   ├─ Renders step trace live (if reasoning expanded)
   └─ Renders output card: KeyFigure → Narrative → Chart → Citations → SQL
```

---

## Model Stack

| Pipeline job | Model | Provider | Why |
|---|---|---|---|
| Intent classification + schema routing | Llama 4 Scout 17B | Groq | Merged into single call. Simple structured output. Sub-200ms on Groq LPU. |
| SQL generation | SQLCoder-8B | EC2 (self-hosted) | Purpose-trained on 20,000+ NL→SQL pairs for PostgreSQL. Domain specialist. The architectural differentiator. |
| SQL generation fallback 1 | SQLCoder-8B | HuggingFace API | Same model, managed API. Slower on cold start but reliable. |
| SQL generation fallback 2 | Llama 4 Maverick 17B | Groq | General capable model. SQL quality below SQLCoder but acceptable. |
| Answer narration (dev) | Llama 4 Maverick 17B | Groq | Reserved Gemini quota for demo day. Same prompt. |
| Answer narration (demo) | Gemini 2.5 Flash | Google AI Studio | Best language quality. 250 req/day reserved exclusively for demo. |
| Schema enrichment | Llama 4 Scout 17B | Groq | Infer business labels from column names + samples. One call per upload. |
| Schema embeddings | BAAI/bge-small-en-v1.5 | HuggingFace | 384-dim sentence embeddings for pgvector schema retrieval. Free tier. |

---

## Database Schema (Summary)

```
users                    ← Supabase Auth user IDs (no passwords)
  └── datasets           ← One per uploaded CSV or demo dataset
        └── semantic_states       ← Column profiles + metric dictionary
        └── schema_embeddings     ← pgvector, one row per column
        └── conversations         ← Multiple per dataset per user
              └── messages        ← Full history with output_payload JSON

response_cache           ← SHA256(question + datasetId) → full output
narration_cache          ← SHA256(result_shape + intent) → narrative text
pipeline_runs            ← Per-query telemetry (latency, sql_path, fallbacks, etc.)
dataset_{uuid}           ← Dynamic table per upload (actual CSV data)
```

**Dynamic dataset tables:** Each uploaded CSV gets its own table (`dataset_{uuid}`). Column types inferred from data (NUMERIC, DATE, TEXT). All queried by Agent 2 via the read-only `readonly_agent` PostgreSQL role.

**Hosting:** All tables live in Supabase PostgreSQL (cloud). Fastify connects via `DATABASE_URL` (pooled connection string from Supabase dashboard). pgvector is enabled as a Supabase extension.

---

## Fallback Chain (every step has a recovery path)

```
SQLCoder EC2 timeout or invalid SQL
   └─► SQLCoder HuggingFace API
          └─► Groq Llama 4 Maverick (SQL mode)

Gemini Flash quota / timeout
   └─► Groq Llama 4 Maverick (narrator)

DB returns 0 rows
   └─► Empty state narrative ("No records matched — try broadening your question")

DB runtime error
   └─► Template fallback chain (re-enter from SQL step)

Any unrecoverable error
   └─► SSE error event → browser shows graceful error state
```

---

## Rate Limit Mitigations

| Problem | Mitigation |
|---|---|
| Groq 30 req/min (Scout) | Merged Planner + Agent 1 into single call — 1 call per query instead of 2 |
| Groq burst | Rate-aware queue: read `x-ratelimit-remaining` header, queue if < 3 |
| Groq Maverick rate limit | Round-robin across 3+ API keys (3× effective limit) |
| Gemini 250 req/day | Used only on demo day. Groq Maverick handles all dev narration. |
| Gemini 10 RPM | Round-robin across multiple Google AI Studio keys; narration cache avoids repeat calls |
| Repeat questions | Semantic response cache (24hr TTL) — identical question on same dataset skips pipeline entirely |
| Empty-chat starter prompts | `semantic_states.starter_questions_json` keyed to `updated_at`; cleared on semantic PATCH; frontend dedupes concurrent GETs per dataset |
| Repeat result shapes | Narration cache — same result shape + intent returns cached narrative |
| Primary + secondary narration | Batched into a single narrator call — saves 1 Gemini/Groq call per complex query |

### Optional further LLM reductions (measure first)

If Groq or embedding volume is still high, consider: stronger heuristic-first paths for follow-up suggestions; avoiding a second planner/SQL call when template SQL already validated; short-TTL cache of planner output keyed by question + schema hash (higher complexity). The hot path for duplicate *empty-chat* Groq calls is addressed by starter persistence above.

---

## Auth & Security

| Concern | Mechanism |
|---|---|
| User authentication | Supabase OAuth (Google). JWT issued by Supabase, verified on every Fastify request via service role key. Frontend middleware uses `supabase.auth.getUser()` (validates JWT against Supabase servers) — never `getSession()` which reads from cookies without signature validation. |
| PII protection | Browser-side TypeScript shield. Two-pass detection. Redaction before upload. Backend never receives raw PII. |
| SQL injection | Generated SQL validated via AST parser (node-sql-parser). SELECT-only enforced. Table names are UUID-based (no user input in DDL). `readonly_agent` role has SELECT-only grants. |
| File upload abuse | MIME type validated server-side. Max 50MB enforced. CSV-only. |
| S3 data | Private bucket. No public ACL. Accessed via backend only with AWS credentials. |
| Column/table injection | Column names whitelisted from profiler output before prompt injection. Dynamic table names use UUID slugs only. |

---

## Demo Reliability System

Three layers ensure the demo survives any infrastructure failure:

**Layer 1 — Live pipeline with full fallback chain**
EC2 → HuggingFace → Groq Maverick

**Layer 2 — Demo snapshot system**
Pre-computed JSON responses for 6 scripted queries. Activated via `Ctrl+Shift+D`. Pipeline bypassed. Responses render in ~200ms with simulated step trace. Amber `SNAPSHOT MODE` badge shown in UI.

**Layer 3 — Reasoning trace as trust signal**
If any fallback fires mid-demo, the pipeline trace shows it honestly: `⚠ Using backup query method`. This turns a visible fallback into a demonstration of resilience rather than a failure.

---

## Infrastructure Summary

| Component | Technology | Host |
|---|---|---|
| Frontend | Next.js 14 + Tailwind | Vercel |
| Backend API | Node.js + Fastify | Linux server |
| Database | PostgreSQL 15 + pgvector | Supabase cloud (free tier) |
| File storage | AWS S3 | AWS (eu-west-2) |
| Auth + Database | Supabase Auth (OAuth) + PostgreSQL + pgvector | Supabase cloud (free tier) |
| SQL generation (primary) | SQLCoder-8B | EC2 instance |
| SQL generation (fallback) | SQLCoder-8B API | HuggingFace (free tier) |
| Planner + routing | Llama 4 Scout 17B | Groq (free tier) |
| Narrator (dev) | Llama 4 Maverick 17B | Groq (free tier) |
| Narrator (demo) | Gemini 2.5 Flash | Google AI Studio (free tier) |
| Embeddings | BAAI/bge-small-en-v1.5 | HuggingFace (free tier) |

---

*TGINA — Architecture · NatWest Code for Purpose Hackathon*
