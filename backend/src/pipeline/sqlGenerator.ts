import {
  InferenceClient,
  InferenceClientHubApiError,
  InferenceClientProviderApiError,
  setLogger,
} from '@huggingface/inference';
import Groq from 'groq-sdk';

/** Silence @huggingface/inference SDK "Defaulting to auto" / provider spam on console.log. */
setLogger({
  ...console,
  log: () => {},
  debug: () => {},
});
import { env } from '../config/env.js';
import { groqPool, hfPool } from '../ratelimit/keyPool.js';
import { runGroqQueued } from '../ratelimit/queue.js';
import type { ColumnProfile } from '../semantic/profiler.js';
import { quotePgIdent } from './sqlTemplates.js';
import { validateSql } from './sqlValidator.js';

export type SqlGenerationPath = 'hf' | 'groq_maverick';

/** simple: Groq Maverick only. complex: HF → Groq Maverick (no deterministic template fallback). */
export type SqlTierMode = 'simple' | 'complex';

export type GenerateSqlResult = {
  sql: string;
  path: SqlGenerationPath;
};

/** Thrown when HF + Groq tiers exhaust without valid SQL (includes provider hints, e.g. rate limits). */
export class SqlGenerationUnavailableError extends Error {
  readonly detailHints: string[];

  constructor(summary: string, detailHints: string[] = []) {
    const combined =
      detailHints.length > 0 ? `${summary} ${detailHints.join(' | ')}`.slice(0, 8000) : summary;
    super(combined);
    this.name = 'SqlGenerationUnavailableError';
    this.detailHints = detailHints;
  }
}

const HF_SQL_TIMEOUT_MS = 8000;
const GROQ_SQL_TIMEOUT_MS = 5000;

/** Shared SQL-generation rules (user prompt + Groq system) — rates vs counts, time grain, flags, compound filters. */
const SQL_ANSWERING_RULES = `Rates, ratios, and "per X": If the question asks for a rate, per order, per customer, complaints per order, churn rate, NPS, or any share/percentage, compute SUM(numerator_column)::numeric / NULLIF(SUM(denominator_column), 0) at the requested grain (with GROUP BY as needed), using the exact quoted identifiers from the schema for every column. Do not use SUM of a single count column alone when a rate or "per" was asked—include the correct denominator (e.g. orders, active_customers) from the schema.
Time grain: If the question refers to weeks, months, quarters, years, trends, "when", or compares periods, filter and/or GROUP BY the appropriate date columns using their quoted names from the schema—do not return one global total when the question asks for a time breakdown or period-specific pattern.
Multi-dimensional filters: If the question names more than one constraint (e.g. product category AND country/region, or segment AND time window), combine every constraint in the WHERE clause with AND using the quoted column names from the schema. Do not drop a filter the user asked for.
Flag / boolean-like TEXT: Columns marked semantic=flag are stored as PostgreSQL TEXT (often 'true'/'false' or yes/no style). Compare with text-safe predicates, e.g. (LOWER(TRIM("col"::text)) IN ('true','1','yes','y')) for true-like values and ('false','0','no','n') for false-like values, using the exact quoted identifier from the schema. Do not compare flag columns to free-form English phrases.`;

const GROQ_SQL_SYSTEM_PROMPT = `You output a single PostgreSQL SELECT statement only. No markdown, no explanation.

Dataset columns are often quoted (e.g. "Employee Code") because names come from spreadsheet headers. Copy every column reference exactly as shown in the user schema block, including double quotes. Do not invent snake_case or run-together names (wrong: employeecode; right: "Employee Code" when that is the schema).

${SQL_ANSWERING_RULES}`;

export function buildSqlCoderPrompt(params: {
  question: string;
  tableName: string;
  columns: ColumnProfile[];
  metricDefinitions: string;
}): string {
  const colLines = params.columns.map(
    (c) =>
      `${quotePgIdent(c.columnName)} (${c.postgresType}; semantic=${c.semanticType}) -- ${c.businessLabel}: ${c.description}`,
  );
  return `### Task
Generate a PostgreSQL SELECT query to answer the question.

### Database Schema
Table: ${quotePgIdent(params.tableName)}
Columns (first token on each line is the exact PostgreSQL identifier — copy it verbatim, quotes included):
${colLines.join('\n')}

### Metric Definitions
${params.metricDefinitions || 'None'}

### Constraints
- SELECT only. No INSERT, UPDATE, DELETE, DROP, CREATE, or DDL.
- Column references must use the quoted identifiers from the schema lines above. Headers like Employee Code appear as "Employee Code" in SQL — not as employeecode or employee_code unless that exact spelling appears in the schema.
- Use parameterised-style literals (no $1 $2 — inline safe values only).
- Limit result rows to 100 maximum.
- Handle NULL values with COALESCE where appropriate.
${SQL_ANSWERING_RULES.split('\n').map((line) => `- ${line}`).join('\n')}

### Question
${params.question}

### SQL`;
}

function extractSqlFromLooseText(text: string): string {
  const trimmed = text.trim();
  const m = trimmed.match(/SELECT[\s\S]+?;/i) ?? trimmed.match(/SELECT[\s\S]+$/i);
  if (m) {
    return m[0].replace(/;$/g, '').trim();
  }
  return trimmed;
}

function logSqlTier(message: string, extra?: unknown): void {
  if (!env.SQL_TIER_LOG) return;
  if (extra !== undefined) {
    console.warn(`[sql:tier] ${message}`, extra);
  } else {
    console.warn(`[sql:tier] ${message}`);
  }
}

function isAbortError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === 'AbortError' || /aborted|abort/i.test(e.message))
  );
}

/**
 * Hugging Face SQL tier: `textGeneration` (hf-inference, then auto), then `chatCompletion`
 * (featherless-ai, then auto). Some models are Hub-mapped only as conversational (e.g. SQLCoder on
 * Featherless) — the key is valid but `textGeneration` cannot succeed for those.
 */
async function tierHf(prompt: string): Promise<string | null> {
  const model = env.SQLCODER_HF_MODEL;
  const key = hfPool.next();

  const runTextGeneration = async (label: 'hf-inference' | 'auto', provider?: 'hf-inference') => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HF_SQL_TIMEOUT_MS);
    try {
      const client = new InferenceClient(key);
      const data = await client.textGeneration(
        {
          model,
          inputs: prompt,
          parameters: { max_new_tokens: 256 },
          ...(provider ? { provider } : {}),
        },
        { signal: ctrl.signal },
      );
      if (data && typeof data.generated_text === 'string') {
        return extractSqlFromLooseText(data.generated_text);
      }
      logSqlTier('HF textGeneration returned no generated_text', { model, label });
      return null;
    } finally {
      clearTimeout(t);
    }
  };

  let firstOut: string | null = null;
  try {
    firstOut = await runTextGeneration('hf-inference', 'hf-inference');
  } catch (e) {
    if (isAbortError(e)) {
      logSqlTier('HF hf-inference request timed out or aborted', { model });
      return null;
    }
    logSqlTier('HF hf-inference attempt failed; retrying with provider auto', {
      model,
      message: e instanceof Error ? e.message : String(e),
    });
  }
  if (firstOut !== null) return firstOut;

  try {
    const fallback = await runTextGeneration('auto');
    if (fallback !== null) return fallback;
  } catch (e) {
    if (isAbortError(e)) {
      logSqlTier('HF auto-provider request timed out or aborted', { model });
      return null;
    }
    if (e instanceof InferenceClientProviderApiError || e instanceof InferenceClientHubApiError) {
      logSqlTier('HF Hub or inference HTTP error', {
        model,
        status: e.httpResponse?.status,
        message: e.message,
      });
    } else {
      logSqlTier('HF inference failed', {
        model,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Many Hub models (e.g. defog/llama-3-sqlcoder-8b) are mapped only as conversational on
  // Featherless — textGeneration never works; chatCompletion does with a valid HF token.
  const runChatCompletion = async (
    label: 'featherless-ai' | 'auto',
    provider?: 'featherless-ai',
  ): Promise<string | null> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HF_SQL_TIMEOUT_MS);
    try {
      const client = new InferenceClient(key);
      const out = await client.chatCompletion(
        {
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 256,
          temperature: 0,
          ...(provider ? { provider } : {}),
        },
        { signal: ctrl.signal },
      );
      const text = out.choices?.[0]?.message?.content;
      if (typeof text === 'string' && text.trim()) {
        return extractSqlFromLooseText(text);
      }
      logSqlTier('HF chatCompletion returned no assistant content', { model, label });
      return null;
    } finally {
      clearTimeout(t);
    }
  };

  try {
    const cc = await runChatCompletion('featherless-ai', 'featherless-ai');
    if (cc !== null) return cc;
  } catch (e) {
    if (isAbortError(e)) {
      logSqlTier('HF chatCompletion (featherless-ai) timed out or aborted', { model });
      return null;
    }
    logSqlTier('HF chatCompletion featherless-ai failed; retrying auto', {
      model,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const ccAuto = await runChatCompletion('auto');
    if (ccAuto !== null) return ccAuto;
  } catch (e) {
    if (isAbortError(e)) {
      logSqlTier('HF chatCompletion (auto) timed out or aborted', { model });
      return null;
    }
    if (e instanceof InferenceClientProviderApiError || e instanceof InferenceClientHubApiError) {
      logSqlTier('HF chatCompletion HTTP error', {
        model,
        status: e.httpResponse?.status,
        message: e.message,
      });
    } else {
      logSqlTier('HF chatCompletion failed', {
        model,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return null;
}

async function tierGroqMaverick(prompt: string): Promise<{ sql: string | null; errorHint?: string }> {
  const work = runGroqQueued(() => {
    const groq = new Groq({ apiKey: groqPool.next() });
    return groq.chat.completions
      .create({
        model: env.GROQ_MODEL_SQL_FALLBACK,
        temperature: 0,
        max_tokens: 512,
        messages: [
          {
            role: 'system',
            content: GROQ_SQL_SYSTEM_PROMPT,
          },
          { role: 'user', content: prompt },
        ],
      })
      .withResponse();
  });

  try {
    const completion = await Promise.race([
      work,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('groq_sql_timeout')), GROQ_SQL_TIMEOUT_MS),
      ),
    ]);

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      return { sql: null, errorHint: 'Groq SQL model returned empty content' };
    }
    return { sql: extractSqlFromLooseText(text) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logSqlTier('Groq Maverick SQL tier failed', { message: msg });
    return { sql: null, errorHint: msg };
  }
}

type GenerateSqlParams = {
  question: string;
  tableName: string;
  columns: ColumnProfile[];
  metricDefinitions?: string;
  sqlTierMode: SqlTierMode;
};

/**
 * One full pass: `simple` → Maverick; `complex` → HF → Maverick. No template tier.
 * Validates after each tier. Returns null + hints if every tier fails or yields invalid SQL.
 */
async function tryGenerateSqlOnce(
  params: GenerateSqlParams,
): Promise<{ result: GenerateSqlResult | null; hints: string[] }> {
  const { question, tableName, columns, metricDefinitions = '', sqlTierMode } = params;
  const prompt = buildSqlCoderPrompt({ question, tableName, columns, metricDefinitions });
  const allowedTables = [tableName];
  const hints: string[] = [];

  const tryTier = (sql: string | null, path: SqlGenerationPath): GenerateSqlResult | null => {
    if (!sql) return null;
    const v = validateSql(sql, allowedTables);
    if (v.valid) {
      return { sql: sql.trim(), path };
    }
    return null;
  };

  if (sqlTierMode === 'complex') {
    const hf = await tierHf(prompt).catch(() => null);
    if (hf && env.SQL_TIER_LOG) {
      const vr = validateSql(hf, allowedTables);
      if (!vr.valid) {
        logSqlTier('HF produced SQL that failed validation', {
          reason: vr.reason,
          preview: hf.slice(0, 280),
        });
      }
    }
    const hb = tryTier(hf, 'hf');
    if (hb) return { result: hb, hints: [] };
    if (hf) {
      const vr = validateSql(hf, allowedTables);
      hints.push(vr.valid ? 'HF: unexpected validation state' : `HF SQL invalid: ${vr.reason}`);
    } else {
      hints.push('Hugging Face SQL tier returned no usable SQL');
    }
  }

  const gq = await tierGroqMaverick(prompt);
  const gc = tryTier(gq.sql, 'groq_maverick');
  if (gc) return { result: gc, hints: [] };

  if (gq.sql) {
    const vr = validateSql(gq.sql, allowedTables);
    hints.push(vr.valid ? 'Groq SQL: validation mismatch' : `Groq SQL invalid: ${vr.reason}`);
  } else if (gq.errorHint) {
    hints.push(`Groq SQL model: ${gq.errorHint}`);
  } else {
    hints.push('Groq SQL tier returned no output');
  }

  return { result: null, hints };
}

const USER_FACING_SQL_FAILURE =
  'SQL generation failed: models did not return valid SQL, or the service is temporarily unavailable or rate-limited. Please try again in a few minutes.';

/**
 * §6.2 — Planner intent: `simple` → Groq Maverick; `complex` → HF → Groq Maverick.
 * Validates after each tier. Runs the full chain twice before failing (no template fallback).
 */
export async function generateSql(params: GenerateSqlParams): Promise<GenerateSqlResult> {
  let { result, hints } = await tryGenerateSqlOnce(params);
  if (result) return result;

  if (env.SQL_TIER_LOG) {
    logSqlTier('SQL tier retry (attempt 2/2)', { hints });
  }
  ({ result, hints } = await tryGenerateSqlOnce(params));
  if (result) return result;

  throw new SqlGenerationUnavailableError(USER_FACING_SQL_FAILURE, hints);
}
