-- Dev / eval hygiene: clear API caches so identical questions are not served from Postgres.
-- Safe to run in a dev project; TTL is otherwise 24h.
-- Pair with backend env: DISABLE_RESPONSE_CACHE=true, DISABLE_NARRATION_CACHE=true.

DELETE FROM response_cache;
DELETE FROM narration_cache;
