import Groq from 'groq-sdk';
import Papa from 'papaparse';
import { z } from 'zod';
import { env } from '../config/env.js';
import { groqPool } from '../ratelimit/keyPool.js';
import { runGroqQueued } from '../ratelimit/queue.js';
import type { PiiRedactionItem, PiiSheetResult } from './types.js';

const ALLOWED_TAGS = [
  'REDACTED_CONFIDENTIAL',
  'REDACTED_EMAIL',
  'REDACTED_PHONE',
  'REDACTED_POSTCODE',
  'REDACTED_ID',
  'REDACTED_SORT_CODE',
  'REDACTED_IFSC',
  'REDACTED_PAN',
  'REDACTED_NI',
  'REDACTED_AADHAAR',
  'REDACTED_ACCOUNT',
] as const;

const decisionSchema = z.object({
  column: z.string(),
  redact: z.boolean(),
  reason: z.string().max(600),
  replacementTag: z.string(),
});

const agentResponseSchema = z.object({
  decisions: z.array(decisionSchema),
});

const MAX_SAMPLE_ROWS = 14;
const MAX_CELL_LEN = 64;

function normalizeTag(tag: string): string {
  const t = tag.trim();
  if ((ALLOWED_TAGS as readonly string[]).includes(t)) return t;
  return 'REDACTED_CONFIDENTIAL';
}

function buildSamplePayload(csv: string): { headers: string[]; sampleRows: Record<string, string>[] } {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  const headers = parsed.meta.fields ?? [];
  const rows = parsed.data.slice(0, MAX_SAMPLE_ROWS).map((row) => {
    const out: Record<string, string> = {};
    for (const h of headers) {
      let v = String(row[h] ?? '').trim();
      if (v.length > MAX_CELL_LEN) v = `${v.slice(0, MAX_CELL_LEN)}…`;
      out[h] = v;
    }
    return out;
  });
  return { headers, sampleRows: rows };
}

function applyDecisions(
  csv: string,
  decisions: z.infer<typeof decisionSchema>[],
  columnKeyPrefix: string,
): PiiSheetResult {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  const headers = new Set(parsed.meta.fields ?? []);
  const byCol = new Map<string, { reason: string; tag: string }>();
  for (const d of decisions) {
    if (!d.redact) continue;
    if (!headers.has(d.column)) continue;
    byCol.set(d.column, {
      reason: d.reason.trim() || 'Marked as sensitive',
      tag: normalizeTag(d.replacementTag),
    });
  }

  let totalRedactions = 0;
  const redactedColumnsSet = new Set<string>();
  const items: PiiRedactionItem[] = [];

  for (const [col, meta] of byCol) {
    redactedColumnsSet.add(col);
    const key =
      columnKeyPrefix === '_' ? col : `${columnKeyPrefix}: ${col}`;
    items.push({
      columnKey: key,
      reason: meta.reason,
      label: meta.tag,
    });
  }

  const finalRows = parsed.data.map((row) => {
    const newRow: Record<string, string> = { ...row };
    for (const [col, meta] of byCol) {
      if (newRow[col] && String(newRow[col]).trim() !== '') {
        newRow[col] = `[${meta.tag}]`;
        totalRedactions++;
      }
    }
    return newRow;
  });

  const redactedCsv = Papa.unparse(finalRows);

  return {
    redactedCsv,
    redactedColumns: Array.from(redactedColumnsSet),
    totalRedactions,
    items,
    method: 'agent',
  };
}

/**
 * Groq-based column-level PII decisions. Returns null on any failure (caller uses heuristic fallback).
 */
export async function runShieldAgentCsv(
  csv: string,
  sheetLabel: string,
  columnKeyPrefix: string,
): Promise<PiiSheetResult | null> {
  const { headers, sampleRows } = buildSamplePayload(csv);
  if (headers.length === 0) return null;

  const model = env.GROQ_MODEL_PII.trim() || env.GROQ_MODEL_PLANNER;

  const userContent = `Sheet: ${sheetLabel}
Column headers (exact names): ${JSON.stringify(headers)}
Sample rows (values may be truncated): ${JSON.stringify(sampleRows)}

Task: Decide which columns contain personally identifiable information (PII) or secrets that must be redacted before storage (names, emails, phones, addresses, government IDs, bank details, etc.).
Do NOT redact pure business analytics: dates, amounts, categories, product IDs, anonymous counts, unless they are clearly personal identifiers.
For each column you recommend redacting, pick the best replacementTag from this exact list: ${ALLOWED_TAGS.join(', ')}.

Respond with JSON only:
{"decisions":[{"column":"<exact header from list>","redact":true|false,"reason":"short factual reason","replacementTag":"REDACTED_..."}]}`;

  const completion = await runGroqQueued(() => {
    const groq = new Groq({ apiKey: groqPool.next() });
    return groq.chat.completions
      .create({
        model,
        temperature: 0,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You output only valid JSON. Never include markdown. Be conservative: redact clear PII; do not redact generic metrics or dates used for analytics.',
          },
          { role: 'user', content: userContent },
        ],
      })
      .withResponse();
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }

  const parsedOut = agentResponseSchema.safeParse(raw);
  if (!parsedOut.success) return null;

  const withRedact = parsedOut.data.decisions.filter((d) => d.redact);
  if (withRedact.length === 0) {
    return {
      redactedCsv: csv,
      redactedColumns: [],
      totalRedactions: 0,
      items: [],
      method: 'agent',
    };
  }

  return applyDecisions(csv, parsedOut.data.decisions, columnKeyPrefix);
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}
