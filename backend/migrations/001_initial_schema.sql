-- Talk to Data — Initial Schema
-- Run with: npm run migrate (from backend/ — loads .env) or: psql "$DATABASE_URL" -f migrations/001_initial_schema.sql
-- Requires Supabase PostgreSQL with pgvector extension enabled
-- Enable pgvector via Supabase Dashboard → Database → Extensions before running

-- =====================================================
-- Extensions
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Core tables
-- =====================================================

-- Users (mirrors Supabase Auth — never store passwords here)
CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY,              -- Supabase Auth user ID (sub from JWT)
  email       TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Datasets (one per uploaded CSV or demo dataset)
CREATE TABLE IF NOT EXISTS datasets (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,               -- Display name (original filename)
  s3_key          TEXT,                               -- S3 object key; NULL for demo datasets
  row_count       INTEGER,
  column_count    INTEGER,
  is_demo         BOOLEAN     NOT NULL DEFAULT FALSE,
  demo_slug       TEXT,                               -- 'sunita' | 'james' | 'donations'
  data_table_name TEXT        NOT NULL,               -- e.g. 'dataset_4f3a2b1c...'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Semantic states (one per dataset — column profiles + metric dictionary)
CREATE TABLE IF NOT EXISTS semantic_states (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id        UUID        NOT NULL UNIQUE REFERENCES datasets(id) ON DELETE CASCADE,
  schema_json       JSONB       NOT NULL,             -- Full ColumnProfile[] + understandingCard
  understanding_card TEXT,                            -- Plain English one-sentence summary
  is_user_corrected BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schema embeddings (one row per column per dataset — for pgvector retrieval)
CREATE TABLE IF NOT EXISTS schema_embeddings (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id     UUID        NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  column_name    TEXT        NOT NULL,
  embedding_text TEXT        NOT NULL,                -- The text that was embedded
  embedding      vector(384),                         -- BAAI/bge-small-en-v1.5 (384 dims)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- hnsw index for fast cosine similarity search on schema embeddings
CREATE INDEX IF NOT EXISTS schema_embeddings_embedding_idx
  ON schema_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Conversations (multiple per dataset per user)
CREATE TABLE IF NOT EXISTS conversations (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id UUID        NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,                                    -- Auto-set from first question (max 60 chars)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages (user questions + assistant responses with full output payload)
CREATE TABLE IF NOT EXISTS messages (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT        NOT NULL,               -- Question text or narrative text
  output_payload  JSONB,                              -- Assistant only: full OutputPayload
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Cache tables
-- =====================================================

-- Response cache — full output keyed by SHA256(normalised_question + dataset_id)
CREATE TABLE IF NOT EXISTS response_cache (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key      TEXT        NOT NULL UNIQUE,
  output_payload JSONB       NOT NULL,
  hit_count      INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

-- Narration cache — reuse narrative text for identical result shapes
CREATE TABLE IF NOT EXISTS narration_cache (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key  TEXT        NOT NULL UNIQUE,             -- SHA256(result_shape_fingerprint + intent)
  narration  TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

-- =====================================================
-- Telemetry
-- =====================================================

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id        UUID        REFERENCES conversations(id),
  message_id             UUID        REFERENCES messages(id),
  intent                 TEXT,                        -- 'conversational' | 'simple_query' | 'complex_query' | 'follow_up_cache'
  latency_total_ms       INTEGER,
  latency_planner_ms     INTEGER,
  latency_sql_ms         INTEGER,
  latency_db_ms          INTEGER,
  latency_narrator_ms    INTEGER,
  sql_path               TEXT,                        -- 'hf' | 'groq_maverick' | 'template'
  sql_valid              BOOLEAN,
  rows_returned          INTEGER,
  cache_hit              TEXT,                        -- 'response_cache' | 'narration_cache' | 'none'
  fallback_triggered     BOOLEAN     NOT NULL DEFAULT FALSE,
  fallback_step          TEXT,
  fallback_target        TEXT,
  secondary_query_fired  BOOLEAN     NOT NULL DEFAULT FALSE,
  secondary_dimension    TEXT,
  confidence_score       INTEGER,
  snapshot_used          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Read-only role for Agent 2 (SQL execution)
-- Safe to run multiple times — DO block guards against duplicate
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_roles WHERE rolname = 'readonly_agent'
  ) THEN
    CREATE ROLE readonly_agent;
  END IF;
END
$$;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_agent;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_agent;

-- =====================================================
-- Helpful indexes for common query patterns
-- =====================================================

CREATE INDEX IF NOT EXISTS datasets_user_id_idx        ON datasets(user_id);
CREATE INDEX IF NOT EXISTS conversations_dataset_id_idx ON conversations(dataset_id);
CREATE INDEX IF NOT EXISTS conversations_user_id_idx    ON conversations(user_id);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS schema_embeddings_dataset_id_idx ON schema_embeddings(dataset_id);
CREATE INDEX IF NOT EXISTS response_cache_expires_at_idx ON response_cache(expires_at);
CREATE INDEX IF NOT EXISTS narration_cache_expires_at_idx ON narration_cache(expires_at);
CREATE INDEX IF NOT EXISTS pipeline_runs_conversation_id_idx ON pipeline_runs(conversation_id);
