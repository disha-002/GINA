import Groq from 'groq-sdk';
import { z } from 'zod';
import { env } from '../config/env.js';
import { groqPool } from '../ratelimit/keyPool.js';
import { runGroqQueued } from '../ratelimit/queue.js';
import type { ColumnProfile } from '../semantic/profiler.js';

/**
 * Last-resort starters when there is no column metadata (empty schema).
 * Intentionally generic — no spending/amount wording.
 */
export const GENERIC_STARTERS_NO_SCHEMA: ReadonlyArray<{ title: string; question: string }> = [
  { title: 'Overview', question: 'What is this dataset about at a high level?' },
  { title: 'Preview', question: 'Show me the first 15 rows so I can see what the data looks like.' },
  { title: 'Size', question: 'How many rows are in this dataset?' },
  { title: 'Structure', question: 'What columns does this dataset have and what do they represent?' },
];

const starterJsonSchema = z.object({
  starters: z.array(
    z.object({
      title: z.string(),
      question: z.string(),
    }),
  ),
});

function schemaSignals(columns: ColumnProfile[]): string {
  const hasAmount = columns.some((c) => c.semanticType === 'amount');
  const hasCategory = columns.some((c) => c.semanticType === 'category');
  const hasDate = columns.some((c) => c.semanticType === 'date');
  return `has_amount_column=${hasAmount}, has_category_column=${hasCategory}, has_date_column=${hasDate}`;
}

/** Drop LLM lines that hallucinate money/spend when the schema has no amount column. */
function questionMatchesSchema(question: string, columns: ColumnProfile[]): boolean {
  const lower = question.toLowerCase();
  const hasAmount = columns.some((c) => c.semanticType === 'amount');
  const hasDate = columns.some((c) => c.semanticType === 'date');
  if (!hasAmount) {
    if (
      /\b(amount|spend|spent|spending|revenue|cost|price|budget|currency|pounds?|dollars?|euros?)\b/i.test(
        lower,
      )
    ) {
      return false;
    }
  }
  if (!hasDate) {
    if (/\b(over time|time series|trend over|month over month|line chart|year over year)\b/i.test(lower)) {
      return false;
    }
  }
  return true;
}

/**
 * Four schema-aware starter prompts without calling the LLM.
 * Avoids money/spending language unless an amount column exists.
 */
export function buildHeuristicStarters(columns: ColumnProfile[]): { title: string; question: string }[] {
  if (columns.length === 0) {
    return [...GENERIC_STARTERS_NO_SCHEMA];
  }

  const cat = columns.find((c) => c.semanticType === 'category');
  const amt = columns.find((c) => c.semanticType === 'amount');
  const dt = columns.find((c) => c.semanticType === 'date');
  const textCol =
    columns.find((c) => c.semanticType === 'text') ??
    columns.find((c) => c.semanticType === 'identifier') ??
    columns[0];

  const out: { title: string; question: string }[] = [];

  out.push({
    title: 'Overview',
    question: 'Give me a concise summary of what this dataset contains and what questions I can explore.',
  });

  if (cat && amt) {
    out.push({
      title: 'Top groups',
      question: `What are the top 5 ${cat.businessLabel ?? 'groups'} by total ${amt.businessLabel ?? 'amount'}?`,
    });
  } else if (cat) {
    out.push({
      title: 'Breakdown',
      question: `How many records are there for each ${cat.businessLabel ?? 'category'}?`,
    });
  } else if (amt) {
    out.push({
      title: 'Largest values',
      question: `What are the largest ${amt.businessLabel ?? 'values'} in this dataset?`,
    });
  } else {
    const label = textCol?.businessLabel ?? textCol?.columnName ?? 'values';
    out.push({
      title: 'Sample',
      question: `Show me a few example ${label} from the data and how often they appear.`,
    });
  }

  if (dt) {
    if (amt) {
      out.push({
        title: 'Trend',
        question: `Show how ${amt.businessLabel ?? 'values'} change over ${dt.businessLabel ?? 'time'} as a line chart.`,
      });
    } else {
      out.push({
        title: 'Timeline',
        question: `How are records distributed across ${dt.businessLabel ?? 'dates'} over time?`,
      });
    }
  } else {
    out.push({
      title: 'Preview',
      question: 'Show me the first 15 rows so I can inspect the structure.',
    });
  }

  out.push({
    title: 'Count',
    question: 'How many rows are in this dataset in total?',
  });

  const extras: { title: string; question: string }[] = [
    {
      title: 'Columns',
      question: 'List the main columns and what each one is used for.',
    },
    {
      title: 'Patterns',
      question: 'What patterns or outliers should I notice in this dataset?',
    },
  ];

  const seen = new Set<string>();
  const uniq: { title: string; question: string }[] = [];
  for (const x of [...out, ...extras]) {
    const k = x.question.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(x);
    if (uniq.length >= 4) break;
  }

  return uniq.slice(0, 4);
}

const SYSTEM = `You write four "starter" questions for a brand-new chat: the user has not asked anything yet.

Return JSON only (no markdown) with shape:
{ "starters": [ { "title": "Short label", "question": "Full question in plain English" } ] }

Rules:
- Exactly 4 items.
- Each title is 1–3 words; each question is one complete, natural question.
- The user message includes schema flags (has_amount_column, etc.) and a column list with semantic types. You MUST follow them:
  - If has_amount_column is false: do NOT mention money, spend, spending, amount, price, revenue, cost, budget, or "by amount". Do not ask for totals, sums, or rankings by numeric value unless a non-amount numeric interpretation is clearly justified by column labels.
  - If has_category_column is false: do not ask for breakdowns "by category" or similar unless another grouping column is named in the schema.
  - If has_date_column is false: do not ask for trends "over time" or time-series charts.
- When those building blocks exist, prefer questions that use the actual business labels from the column list.
- Include one broad overview-style question; the others should vary (distribution, sample/preview, counts, or time — only if the schema supports it).
- Questions must be answerable with SELECT on this dataset only. No duplicate or near-duplicate questions.
- Plain English; no markdown; no numbering in the question text.`;

function schemaLines(columns: ColumnProfile[]): string {
  return columns
    .slice(0, 28)
    .map((c) => `- ${c.businessLabel || c.columnName} (${c.semanticType})`)
    .join('\n');
}

/**
 * Merge model output with heuristic starters until there are four unique questions.
 * Padding uses schema-aware questions, not legacy spending defaults.
 */
export function mergeStartersWithDefaults(
  parsed: Array<{ title?: string; question?: string }>,
  columns: ColumnProfile[],
): { title: string; question: string }[] {
  const fallback = buildHeuristicStarters(columns);
  const out: { title: string; question: string }[] = [];
  const seenQ = new Set<string>();

  for (const x of parsed) {
    const q = typeof x.question === 'string' ? x.question.trim() : '';
    if (!q || !questionMatchesSchema(q, columns)) continue;
    const k = q.toLowerCase();
    if (seenQ.has(k)) continue;
    seenQ.add(k);
    const titleRaw = typeof x.title === 'string' ? x.title.trim() : '';
    const title =
      titleRaw.length > 0 ? titleRaw.slice(0, 40) : q.split(/[.?!]/)[0]!.trim().slice(0, 24) || 'Explore';
    out.push({ title, question: q });
    if (out.length >= 4) return out;
  }

  for (const d of fallback) {
    if (out.length >= 4) break;
    const k = d.question.toLowerCase();
    if (seenQ.has(k)) continue;
    seenQ.add(k);
    out.push({ title: d.title, question: d.question });
  }

  return out.slice(0, 4);
}

/**
 * Four contextual starter questions for an empty chat, grounded in schema + understanding card.
 */
export async function generateStarterQuestions(
  columns: ColumnProfile[],
  understandingCard: string,
  datasetDisplayName: string,
): Promise<{ title: string; question: string }[]> {
  if (columns.length === 0) {
    return [...GENERIC_STARTERS_NO_SCHEMA];
  }

  const heuristic = buildHeuristicStarters(columns);

  const model = env.GROQ_MODEL_FOLLOWUPS.trim() || env.GROQ_MODEL_NARRATOR;
  const user = [
    `Dataset name: ${datasetDisplayName}`,
    schemaSignals(columns),
    `Understanding card:\n${understandingCard || '(none)'}`,
    `Columns:\n${schemaLines(columns)}`,
  ].join('\n\n');

  const work = runGroqQueued(() => {
    const groq = new Groq({ apiKey: groqPool.next() });
    return groq.chat.completions
      .create({
        model,
        temperature: 0.4,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      })
      .withResponse();
  });

  try {
    const completion = await Promise.race([
      work,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('starter_timeout')), env.FOLLOW_UP_TIMEOUT_MS),
      ),
    ]);

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return heuristic;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return heuristic;
    }

    const safe = starterJsonSchema.safeParse(parsed);
    if (!safe.success) {
      return heuristic;
    }

    return mergeStartersWithDefaults(safe.data.starters, columns);
  } catch {
    return heuristic;
  }
}

/** @deprecated Use GENERIC_STARTERS_NO_SCHEMA or buildHeuristicStarters */
export const DEFAULT_STARTER_QUESTIONS = GENERIC_STARTERS_NO_SCHEMA;
