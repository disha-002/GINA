# Operational analytics — query pipeline (`pipeline_runs`)

This document summarizes **production-style telemetry** already written by GINA on every `POST /api/query` completion. Numbers below are from a **sample window** (see scope); re-run the SQL against your database to refresh.

## Scope

- **Table:** `pipeline_runs`
- **Window:** last **7 days** (aligned with [`../sql/pipeline_runs_analytics.sql`](../sql/pipeline_runs_analytics.sql))
- **Sample size:** **n = 336** completed runs (snapshot below)

## How to regenerate

Run the queries in [`../sql/pipeline_runs_analytics.sql`](../sql/pipeline_runs_analytics.sql) in the **Supabase SQL editor**, **psql**, or any client pointed at the same PostgreSQL database as the API. Adjust the `INTERVAL` filter if you need a different window.

---

## Latency (end-to-end)

Total pipeline time until the answer was ready (`latency_total_ms`).

| Metric | Value (ms) |
|--------|------------|
| **Average** | 7387.61 |
| **p95** | 20709.25 |
| **n** | 336 |

**Takeaway:** wall-clock latency is dominated by **LLM-bound stages** (see breakdown below), not the database.

---

## Latency breakdown by stage (averages)

| Planner | SQL gen | DB | Narrator |
|---------|---------|-----|----------|
| 2808.40 | 2644.21 | 213.36 | 2058.10 |

**Takeaway:** planner + SQL generation + narration account for most time; **read-only execution** stays comparatively small.

---

## Intent mix

How the planner labeled queries in this window:

| Intent | Count |
|--------|------:|
| `simple_query` | 241 |
| `conversational` | 55 |
| *(null)* | 24 |
| `complex_query` | 15 |
| `follow_up_cache` | 1 |

**Takeaway:** most routed traffic is **simple_query**; **complex_query** is a minority; conversational and uncached follow-ups are present but smaller.

---

## Snapshot usage

Approximate share of runs that used the snapshot / follow-up path:

| pct_snapshot_used | n |
|------------------|---|
| 2.08 | 336 |

**Takeaway:** snapshot shortcuts are **rare** in this sample; most queries run the full pipeline.

---

## Related docs

| Resource | Purpose |
|----------|---------|
| [`../sql/pipeline_runs_analytics.sql`](../sql/pipeline_runs_analytics.sql) | Full query set (cache hits, fallbacks, `sql_path`, etc.) |
| [`../README.md`](../README.md) | Eval bundles + how to run manifest tests |
