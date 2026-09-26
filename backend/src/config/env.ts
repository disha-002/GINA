import 'dotenv/config';
import { z } from 'zod';

const boolFromEnv = z
  .string()
  .optional()
  .transform((v) => v === undefined || v === '' ? false : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_S3_BUCKET: z.string().min(1),
  AWS_REGION: z.string().min(1),

  HF_API_KEY_1: z.string().min(1),
  HF_API_KEY_2: z.string().default(''),
  SQLCODER_HF_MODEL: z.string().min(1),
  EMBEDDING_HF_MODEL: z.string().min(1),

  GROQ_API_KEY_1: z.string().min(1),
  GROQ_API_KEY_2: z.string().default(''),
  GROQ_API_KEY_3: z.string().default(''),
  GROQ_MODEL_PLANNER: z.string().min(1),
  GROQ_MODEL_NARRATOR: z.string().min(1),
  GROQ_MODEL_SQL_FALLBACK: z.string().min(1),
  /** Groq model for contextual follow-up suggestions; empty → GROQ_MODEL_NARRATOR. */
  GROQ_MODEL_FOLLOWUPS: z.string().optional().default(''),
  /** Max time for one follow-up generation Groq call (ms). */
  FOLLOW_UP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  GEMINI_API_KEY_1: z.string().min(1),
  GEMINI_API_KEY_2: z.string().default(''),
  GEMINI_MODEL: z.string().min(1),
  /** Empty → same as GEMINI_MODEL. Used for async dataset overview layout. */
  GEMINI_MODEL_DATASET_OVERVIEW: z.string().optional().default(''),
  /** Max time for one Gemini dataset-overview call (ms). */
  DATASET_OVERVIEW_GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),

  USE_GEMINI_NARRATOR: boolFromEnv,
  /** When true, log Hugging Face SQL tier errors and invalid HF SQL validation reasons to stderr (dev/debug). */
  SQL_TIER_LOG: boolFromEnv,
  SNAPSHOT_MODE: boolFromEnv,
  SQL_FALLBACK_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  SECONDARY_QUERY_DELTA_THRESHOLD: z.coerce.number().positive().default(0.05),

  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** Comma-separated extra CORS origins (e.g. https://app.vercel.app). Localhost defaults are always allowed in server.ts. */
  CORS_ORIGINS: z.string().optional().default(''),

  /**
   * When true, skip `response_cache` lookup so identical questions re-run the full pipeline.
   * Useful for eval reruns and debugging.
   */
  DISABLE_RESPONSE_CACHE: boolFromEnv,
  /**
   * When true, skip `narration_cache` read/write so identical result shapes still get fresh narration.
   * Pair with DISABLE_RESPONSE_CACHE for fully cold eval runs.
   */
  DISABLE_NARRATION_CACHE: boolFromEnv,
  /**
   * When true, skip question→column pgvector retrieval; planner/SQL see columns in semantic_state order only.
   */
  DISABLE_SCHEMA_RETRIEVAL: boolFromEnv,
  /** Max columns returned from `schema_embeddings` similarity search before merging into full schema order. */
  SCHEMA_RETRIEVAL_TOP_K: z.coerce.number().int().positive().max(64).default(16),
  /** When true, skip Groq PII agent and use heuristic fallback only. */
  PII_AGENT_DISABLED: boolFromEnv,
  /** Max time for one PII agent Groq call (ms). */
  PII_AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  /** Groq model for PII column detection; empty → same as GROQ_MODEL_PLANNER. */
  GROQ_MODEL_PII: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
