-- Per-upload content fingerprint (same hash on all sheet-rows from one workbook upload)
ALTER TABLE datasets
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_datasets_user_content_hash
  ON datasets (user_id, content_hash)
  WHERE is_demo = FALSE AND content_hash IS NOT NULL;

COMMENT ON COLUMN datasets.content_hash IS 'SHA-256 hex of raw uploaded file; duplicate uploads rejected; shared across sheet-rows from same file';
