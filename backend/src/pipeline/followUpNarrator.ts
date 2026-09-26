import Groq from 'groq-sdk';
import { z } from 'zod';
import { env } from '../config/env.js';
import { groqPool } from '../ratelimit/keyPool.js';
import { runGroqQueued } from '../ratelimit/queue.js';
import type { ColumnProfile } from '../semantic/profiler.js';
import type { ResultRow } from './dbExecutor.js';
import type { PlannerIntent } from './planner.js';
import { buildFollowUpSuggestions } from './followUpTemplates.js';

const followUpJsonSchema = z.object({
  followUps: z.array(z.string()),
});

const SYSTEM = `You suggest short follow-up questions for a data analytics chat.

Return JSON only (no markdown) with shape: { "followUps": string[] }

Rules:
- Exactly 3 distinct questions in plain English.
- Each must logically extend the user's last question and the assistant's answer — not generic schema questions unrelated to this turn.
- Questions must be answerable using columns from the schema provided (use business-friendly wording; do not require users to know internal column names).
- If the result had 0 rows, suggest ways to broaden filters, relax criteria, or explore related breakdowns — still tied to what they asked.
- No duplicates; no numbering prefixes; no markdown.`;

export type FollowUpGenerationInput = {
  question: string;
  narrative: string;
  understandingCard: string;
  columns: ColumnProfile[];
  relevantColumns: string[];
  intent: PlannerIntent;
  rowCount: number;
  sql?: string;
  keyFigure?: string;
  sampleRows?: ResultRow[];
};

function schemaLines(columns: ColumnProfile[], relevantColumns: string[]): string {
  const rel = new Set(relevantColumns);
  const ordered = [
    ...columns.filter((c) => rel.has(c.columnName)),
    ...columns.filter((c) => !rel.has(c.columnName)),
  ];
  return ordered
    .slice(0, 24)
    .map((c) => `- ${c.businessLabel || c.columnName} (${c.semanticType})`)
    .join('\n');
}

function buildUserPayload(input: FollowUpGenerationInput): string {
  const sample = (input.sampleRows ?? []).slice(0, 5);
  const sqlSnippet =
    input.sql != null && input.sql.length > 400 ? `${input.sql.slice(0, 400)}…` : input.sql;

  return [
    `Dataset summary (optional): ${input.understandingCard || '(none)'}`,
    `Schema (prioritize relevant columns first):\n${schemaLines(input.columns, input.relevantColumns)}`,
    `User question: ${input.question}`,
    `Assistant answer: ${input.narrative}`,
    `Result row count: ${input.rowCount}`,
    input.keyFigure != null && input.keyFigure !== '' ? `Headline figure shown: ${input.keyFigure}` : '',
    sqlSnippet ? `SQL used (reference only): ${sqlSnippet}` : '',
    sample.length > 0 ? `Sample rows (truncated): ${JSON.stringify(sample)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Pads or replaces with schema heuristics when the model returns too few strings. Exported for unit tests. */
export function mergeFollowUpsWithHeuristic(
  primary: string[],
  columns: ColumnProfile[],
  intent: PlannerIntent,
): string[] {
  const cleaned = primary.map((s) => s.trim()).filter((s) => s.length > 0);
  if (cleaned.length === 0) {
    return buildFollowUpSuggestions(columns, intent);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of cleaned) {
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 3) break;
  }

  if (out.length >= 2) {
    return out.slice(0, 3);
  }

  for (const f of buildFollowUpSuggestions(columns, intent)) {
    const k = f.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
    if (out.length >= 3) break;
  }

  return out.slice(0, 3);
}

/**
 * LLM-generated follow-ups for the latest Q&A; falls back to schema heuristics on error.
 */
export async function generateContextualFollowUps(input: FollowUpGenerationInput): Promise<string[]> {
  const model = env.GROQ_MODEL_FOLLOWUPS.trim() || env.GROQ_MODEL_NARRATOR;

  const work = runGroqQueued(() => {
    const groq = new Groq({ apiKey: groqPool.next() });
    return groq.chat.completions
      .create({
        model,
        temperature: 0.35,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildUserPayload(input) },
        ],
      })
      .withResponse();
  });

  try {
    const completion = await Promise.race([
      work,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('follow_up_timeout')), env.FOLLOW_UP_TIMEOUT_MS),
      ),
    ]);

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return buildFollowUpSuggestions(input.columns, input.intent);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return buildFollowUpSuggestions(input.columns, input.intent);
    }

    const safe = followUpJsonSchema.safeParse(parsed);
    if (!safe.success) {
      return buildFollowUpSuggestions(input.columns, input.intent);
    }

    return mergeFollowUpsWithHeuristic(safe.data.followUps, input.columns, input.intent);
  } catch {
    return buildFollowUpSuggestions(input.columns, input.intent);
  }
}
