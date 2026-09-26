import Groq from 'groq-sdk';
import { z } from 'zod';
import { env } from '../config/env.js';
import { groqPool } from '../ratelimit/keyPool.js';
import { runGroqQueued } from '../ratelimit/queue.js';

const plannerOutputSchema = z.object({
  intent: z.enum(['conversational', 'simple_query', 'complex_query', 'follow_up_cache']),
  relevantColumns: z.array(z.string()),
  relevantTables: z.array(z.string()),
  answerFromCache: z.boolean(),
  cacheAnswer: z.unknown().nullable(),
  conversationalReply: z.string().nullable().optional(),
});

export type PlannerIntent = z.infer<typeof plannerOutputSchema>['intent'];

export type PlannerInput = {
  question: string;
  /** Compact column view for the model (from semantic `schema_json.columns`). */
  columns: Array<{
    columnName: string;
    businessLabel: string;
    semanticType: string;
    description: string;
  }>;
  understandingCard?: string;
  /** Last few Q/A pairs (most recent last). */
  sessionExchanges?: Array<{ question: string; answer: string }>;
  /** Short summary e.g. "yes, 12 rows, 3 numeric columns" or null */
  lastResultSetSummary?: string | null;
};

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

/**
 * §6.1 — Groq Scout: intent + relevant columns/tables in one JSON call.
 */
export async function runPlanner(input: PlannerInput): Promise<PlannerOutput> {
  const recent = (input.sessionExchanges ?? []).slice(-3);
  const contextBlock =
    recent.length > 0
      ? recent.map((e) => `Q: ${e.question}\nA: ${e.answer}`).join('\n---\n')
      : '(none)';

  const lastRs = input.lastResultSetSummary ?? 'no';

  const system = `You are a data query planner. Given a user question and dataset schema, return a JSON object with intent classification and relevant columns.

Return JSON only (no markdown) with this shape:
{
  "intent": "conversational" | "simple_query" | "complex_query" | "follow_up_cache",
  "relevantColumns": ["col1"],
  "relevantTables": ["table_name"],
  "answerFromCache": false,
  "cacheAnswer": null,
  "conversationalReply": null
}

Rules:
- How to decide intent: Use the Dataset summary (understanding card) and each column's businessLabel, description, and semanticType to judge whether the user's question is about this data. Users paraphrase (e.g. "latency risk descriptions" vs a column whose description mentions latency risk). Map their intent to real columns by meaning, not by matching their words to columnName strings.
- intent "simple_query" or "complex_query" when the question can be answered using existing columns — including when the topic clearly appears in the understanding card or any column's businessLabel/description, even if the user's wording differs from columnName. List every column your SQL needs in relevantColumns using exact columnName values from the schema (infer which columnName rows apply from the metadata above).
- Tie-break: If you are unsure between "conversational" and SQL, prefer "simple_query" or "complex_query" when the understanding card or any column metadata plausibly relates to the question. Only use "conversational" when the question is clearly outside this dataset's domain or would require inventing columns that do not exist.
- intent "conversational" only for greetings, thanks, jokes, chit-chat, meta questions about the assistant, or questions that are clearly unrelated to the sheet's subject matter (wrong industry, unrelated topics) — not for on-topic questions that merely use different words than the column names. Set relevantColumns to [] and relevantTables to []. Set conversationalReply to a short, friendly reply (lightly humorous OK, stay professional).
- Do not refuse as off-topic when the understanding card or column descriptions indicate the user's topic (e.g. risk levels, agents, metrics named in prose) is in scope.
- If the user truly asks for something no column can provide, use "conversational" and briefly say what is missing.
- "follow_up_cache" only when the user refers to the immediately previous tabular result and it can be answered without new SQL; set answerFromCache and cacheAnswer appropriately.
- "simple_query" vs "complex_query": use simple for single aggregation/filter/ranking; complex for multi-step analysis, comparisons across time periods, root-cause style questions, or questions that need caveats (partial years, rates vs totals). Both labels are acceptable for standard GROUP BY / filtered aggregates—do not overthink the label if the question is clearly answerable with one SELECT.
- Compound filters: When the user names multiple dimensions in one question (e.g. product category AND country/region, or segment AND discount tier), include every columnName needed to express those filters in relevantColumns—do not omit a dimension the user asked for.
- Flag / yes-no columns (semanticType "flag"): For questions about returns, refunds, churn flags, opt-in, or other boolean-style fields, always include those flag columnNames in relevantColumns when they exist in the schema.
- relevantColumns: must match columnName exactly (for SQL safety). Include all columns needed: for rates, per-order, churn, or share questions, include numerator and denominator columns when both exist.
- CRITICAL for SQL intents: Never return "simple_query" or "complex_query" with an empty relevantColumns array, or with any string that is not exactly a columnName from the Schema columns JSON above. If you cannot commit to valid column names, do not use SQL intents—use "conversational" instead. When the user's topic matches the understanding card or column metadata, you must still pick real columnName values (use businessLabel/description to choose which rows apply).
- For relative time phrases ("last year", "YTD", "recent", "this quarter") or trend questions, include all date columns needed to filter or group when present in the schema.
- relevantTables: include only the physical dataset table name when using SQL intents (e.g. dataset_xxx). If unsure, list that table. For conversational intent, use [].

Schema columns (JSON array). When present, the first entries are ranked by embedding similarity to the user's question; the list is still complete—every column the dataset has appears exactly once.
${JSON.stringify(input.columns, null, 2)}

Dataset summary (understanding card):
${input.understandingCard ?? '(none)'}`;

  const user = `Recent session context:\n${contextBlock}\n\nLast result set available: ${lastRs}\n\nUser question:\n${input.question}`;

  const completion = await runGroqQueued(() => {
    const groq = new Groq({ apiKey: groqPool.next() });
    return groq.chat.completions
      .create({
        model: env.GROQ_MODEL_PLANNER,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })
      .withResponse();
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('Planner returned empty content');
  }

  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Planner returned non-JSON');
  }

  const parsed = plannerOutputSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Planner JSON invalid: ${parsed.error.message}`);
  }

  return parsed.data;
}
