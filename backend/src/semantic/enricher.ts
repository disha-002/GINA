import Groq from 'groq-sdk';
import { z } from 'zod';
import { env } from '../config/env.js';
import { groqPool } from '../ratelimit/keyPool.js';
import { runGroqQueued } from '../ratelimit/queue.js';
import type { ColumnProfile, ProfilerColumn } from './types.js';

const enrichmentSchema = z.object({
  columns: z.array(
    z.object({
      columnName: z.string(),
      businessLabel: z.string(),
      semanticType: z.enum(['amount', 'date', 'category', 'identifier', 'flag', 'text']),
      currency: z.enum(['GBP', 'USD', 'EUR']).nullable(),
      description: z.string(),
    }),
  ),
});

/**
 * Step 3 (§5.3): Groq Llama 4 Scout — business labels + descriptions from profiler columns + samples.
 */
export async function enrichProfilerColumns(columns: ProfilerColumn[]): Promise<ColumnProfile[]> {
  if (columns.length === 0) return [];

  const system = `You are a data documentation assistant. Given CSV column statistics and sample values, produce human-readable business metadata.
Return ONLY valid JSON (no markdown) with this exact shape:
{"columns":[{"columnName":"string","businessLabel":"string","semanticType":"amount"|"date"|"category"|"identifier"|"flag"|"text","currency":"GBP"|"USD"|"EUR"|null,"description":"string"}]}
Rules:
- semanticType "amount" for money or numeric measures; set currency to GBP when clearly UK (£) or UK context, else null or USD/EUR if clearly indicated.
- "date" for dates/times; "category" for low-cardinality labels; "identifier" for IDs; "flag" for booleans/Y-N; "text" for free text.
- description: one concise sentence on what the column means for analysis.
- You must include every columnName from the input exactly once.`;

  const user = JSON.stringify({ columns }, null, 2);

  const completion = await runGroqQueued(() => {
    const groq = new Groq({ apiKey: groqPool.next() });
    return groq.chat.completions
      .create({
        model: env.GROQ_MODEL_PLANNER,
        temperature: 0.2,
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
    throw new Error('Groq enrichment returned empty content');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Groq enrichment returned non-JSON');
  }

  const parsed = enrichmentSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(`Enrichment JSON validation failed: ${parsed.error.message}`);
  }

  const byName = new Map(
    parsed.data.columns.map((row) => [row.columnName, row] as const),
  );

  const out: ColumnProfile[] = [];
  for (const base of columns) {
    const row = byName.get(base.columnName);
    if (!row) {
      throw new Error(`Enrichment missing column: ${base.columnName}`);
    }
    out.push({
      columnName: base.columnName,
      businessLabel: row.businessLabel,
      semanticType: row.semanticType,
      currency: row.currency,
      description: row.description,
      sampleValues: base.sampleValues,
      nullPct: base.nullPct,
      uniqueCount: base.uniqueCount,
      valueRange: base.valueRange,
    });
  }

  return out;
}

/**
 * Step 8 (§5.3): one-sentence understanding card for the dataset (for Phase 2C wiring).
 */
export async function generateUnderstandingCard(
  profiles: ColumnProfile[],
  datasetNameHint = 'dataset',
): Promise<string> {
  if (profiles.length === 0) {
    return `No columns were profiled for ${datasetNameHint}.`;
  }

  const compact = profiles.map((p) => ({
    columnName: p.columnName,
    businessLabel: p.businessLabel,
    semanticType: p.semanticType,
    description: p.description,
  }));

  const system = `Write ONE short plain-English sentence (no markdown, no bullet points) summarising what this spreadsheet is useful for and the main measures/dimensions.`;

  const completion = await runGroqQueued(() => {
    const groq = new Groq({ apiKey: groqPool.next() });
    return groq.chat.completions
      .create({
        model: env.GROQ_MODEL_PLANNER,
        temperature: 0.4,
        max_tokens: 200,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `Dataset name hint: ${datasetNameHint}\nColumns:\n${JSON.stringify(compact, null, 2)}`,
          },
        ],
      })
      .withResponse();
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('Understanding card generation returned empty content');
  }
  return text;
}
