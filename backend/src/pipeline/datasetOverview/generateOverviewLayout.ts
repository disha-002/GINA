import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { geminiPool } from '../../ratelimit/keyPool.js';
import type { DatasetStats } from './computeStats.js';
import type { ChartPlan } from './overviewPayload.js';

const geminiResponseSchema = z.object({
  executiveSummary: z.string().max(6000),
  highlights: z.array(z.string().max(500)).max(12).optional().default([]),
  chartPlans: z
    .array(
      z.object({
        kind: z.enum(['numeric_histogram', 'top_values', 'date_span', 'row_count_big_number']),
        columnName: z.string().nullable().optional(),
        title: z.string().max(220),
        insight: z.string().max(600).optional(),
      }),
    )
    .max(14),
});

function truncateStatsJson(stats: DatasetStats): string {
  const s = JSON.stringify(stats);
  const max = 95_000;
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…(truncated)`;
}

function extractJson(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const body = fence ? fence[1]!.trim() : t;
  return JSON.parse(body);
}

function validatePlansAgainstStats(stats: DatasetStats, plans: ChartPlan[]): ChartPlan[] {
  const names = new Set(stats.columns.map((c) => c.columnName));
  const out: ChartPlan[] = [];
  for (const p of plans) {
    if (p.kind === 'row_count_big_number') {
      out.push({ ...p, columnName: null });
      continue;
    }
    const col = p.columnName?.trim();
    if (!col || !names.has(col)) continue;
    out.push({ ...p, columnName: col });
  }
  return out.slice(0, 14);
}

/**
 * Ask Gemini for summary + chart plan; numbers must only interpret stats JSON (already computed).
 */
export async function generateOverviewLayout(
  stats: DatasetStats,
  understandingCard: string,
): Promise<{ executiveSummary: string; highlights: string[]; chartPlans: ChartPlan[]; model: string }> {
  const model = env.GEMINI_MODEL_DATASET_OVERVIEW || env.GEMINI_MODEL;
  const apiKey = geminiPool.next();
  const ai = new GoogleGenAI({ apiKey });

  const system = `You are a data analyst helping build a dataset overview dashboard.
You MUST NOT invent row counts, sums, or any statistics — those are only in the provided stats JSON.
Your job: write a short executive summary (plain English, no markdown), optional bullet highlights, and choose up to 14 charts by referencing existing column names and chart kinds.

Chart kinds:
- row_count_big_number: one KPI card for total rows (omit columnName).
- numeric_histogram: for NUMERIC columns with a histogram in stats (columnName required).
- top_values: for TEXT columns with topValues in stats (columnName required).
- date_span: for DATE columns with min/max in stats (columnName required).

Respond with ONLY valid JSON matching this shape:
{"executiveSummary":"string","highlights":["optional strings"],"chartPlans":[{"kind":"...","columnName":null or "ExactColumnName","title":"...","insight":"optional"}]}`;

  const user = `Dataset understanding (may be imperfect): ${understandingCard || '(none)'}

STATS_JSON:
${truncateStatsJson(stats)}`;

  const timeoutMs = env.DATASET_OVERVIEW_GEMINI_TIMEOUT_MS;

  const response = await Promise.race([
    ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
      config: {
        temperature: 0.25,
        maxOutputTokens: 8192,
      },
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Gemini overview timed out')), timeoutMs);
    }),
  ]);

  const text = response.text ?? '';
  if (!text.trim()) throw new Error('Gemini returned empty overview');

  const raw = extractJson(text);
  const parsed = geminiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Gemini overview JSON invalid: ${parsed.error.message}`);
  }

  const chartPlans = validatePlansAgainstStats(
    stats,
    parsed.data.chartPlans.map((p) => ({
      kind: p.kind,
      columnName: p.columnName ?? null,
      title: p.title,
      insight: p.insight,
    })),
  );

  return {
    executiveSummary: parsed.data.executiveSummary.trim(),
    highlights: parsed.data.highlights ?? [],
    chartPlans,
    model,
  };
}
