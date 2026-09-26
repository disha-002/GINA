-- Per-dataset overview (async stats + Gemini layout); one row per dataset in semantic_states
ALTER TABLE semantic_states
  ADD COLUMN IF NOT EXISTS overview_status TEXT
    CHECK (overview_status IS NULL OR overview_status IN ('pending', 'ready', 'failed'));

ALTER TABLE semantic_states
  ADD COLUMN IF NOT EXISTS overview_json JSONB;

ALTER TABLE semantic_states
  ADD COLUMN IF NOT EXISTS overview_error TEXT;

ALTER TABLE semantic_states
  ADD COLUMN IF NOT EXISTS overview_model TEXT;

ALTER TABLE semantic_states
  ADD COLUMN IF NOT EXISTS overview_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN semantic_states.overview_status IS 'pending | ready | failed | NULL (never built)';
COMMENT ON COLUMN semantic_states.overview_json IS 'Dataset overview payload: summary + render-ready charts';
COMMENT ON COLUMN semantic_states.overview_error IS 'Last generation error (user-safe message optional)';
COMMENT ON COLUMN semantic_states.overview_model IS 'LLM model id used for narrative/layout';
