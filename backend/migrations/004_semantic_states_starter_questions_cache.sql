-- Persist cached starter prompts per semantic snapshot; invalidated when updated_at changes (e.g. semantic PATCH)
ALTER TABLE semantic_states
  ADD COLUMN IF NOT EXISTS starter_questions_json JSONB;

ALTER TABLE semantic_states
  ADD COLUMN IF NOT EXISTS starter_questions_for_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN semantic_states.starter_questions_json IS 'Cached starter prompts [{title, question}, ...]; use only when starter_questions_for_updated_at matches updated_at';
COMMENT ON COLUMN semantic_states.starter_questions_for_updated_at IS 'Copy of semantic_states.updated_at when starters were generated';
