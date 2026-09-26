-- Operational analytics for GINA query pipeline (table: pipeline_runs)
-- Run against your Postgres (Supabase SQL editor, psql, etc.)

-- ── Volume & time window ─────────────────────────────────────────────────────
-- SELECT COUNT(*) AS runs_last_24h
-- FROM pipeline_runs
-- WHERE created_at >= NOW() - INTERVAL '24 hours';

-- ── Latency: avg / p95 (total) ────────────────────────────────────────────────
SELECT
  ROUND(AVG(latency_total_ms)::numeric, 2) AS avg_latency_total_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_total_ms) AS p95_latency_total_ms,
  COUNT(*) AS n
FROM pipeline_runs
WHERE latency_total_ms IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days';

-- ── Latency breakdown (avg) by stage ─────────────────────────────────────────
SELECT
  ROUND(AVG(latency_planner_ms)::numeric, 2) AS avg_planner_ms,
  ROUND(AVG(latency_sql_ms)::numeric, 2) AS avg_sql_ms,
  ROUND(AVG(latency_db_ms)::numeric, 2) AS avg_db_ms,
  ROUND(AVG(latency_narrator_ms)::numeric, 2) AS avg_narrator_ms
FROM pipeline_runs
WHERE created_at >= NOW() - INTERVAL '7 days';

-- ── Intent mix ───────────────────────────────────────────────────────────────
SELECT intent, COUNT(*) AS n
FROM pipeline_runs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY intent
ORDER BY n DESC;

-- ── Cache hits vs miss ───────────────────────────────────────────────────────
SELECT cache_hit, COUNT(*) AS n
FROM pipeline_runs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY cache_hit
ORDER BY n DESC;

-- ── Fallback rate ────────────────────────────────────────────────────────────
SELECT
  ROUND(100.0 * AVG(CASE WHEN fallback_triggered THEN 1 ELSE 0 END), 2) AS pct_fallback,
  COUNT(*) AS n
FROM pipeline_runs
WHERE created_at >= NOW() - INTERVAL '7 days';

-- ── SQL generation path mix ───────────────────────────────────────────────────
SELECT sql_path, COUNT(*) AS n
FROM pipeline_runs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY sql_path
ORDER BY n DESC;

-- ── Snapshot usage (follow-up / cache paths) ─────────────────────────────────
SELECT
  ROUND(100.0 * AVG(CASE WHEN snapshot_used THEN 1 ELSE 0 END), 2) AS pct_snapshot_used,
  COUNT(*) AS n
FROM pipeline_runs
WHERE created_at >= NOW() - INTERVAL '7 days';
