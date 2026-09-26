import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { groqPool, geminiPool } from '../ratelimit/keyPool.js';
import { runGroqQueued } from '../ratelimit/queue.js';
import type { ResultRow } from './dbExecutor.js';

export type NarratorInput = {
  question: string;
  understandingCard: string;
  primaryRows: ResultRow[];
  secondaryRows?: ResultRow[];
  autoInsights: string[];
};

/** §6.6 – System prompt: plain-English analyst; trap-aware (rates, periods, vague asks). */
const SYSTEM_PROMPT = `You are a plain English data analyst. Explain the query result clearly and concisely. Identify the main driver if decomposition data is present. Never invent numbers — use only the data provided. Use percentages (upto 2 decimal places max) where appropriate when they appear in the data.

Length: Usually 2–3 short sentences. If the user asks to summarise trends, key themes, weekly or yearly metrics, or a "year in review", you may use up to 4–5 short sentences (still plain English, no lists or markdown).

Traps to avoid:
- Partial periods: If comparing years or ranges and the result mixes a full year with a shorter window (e.g. 2025 is only part of a year), say so explicitly and do not treat raw totals as directly comparable unless the data clearly supports it; prefer describing normalised views (e.g. per week or per month) only when those values are in the result.
- Relative time ("last year", "YTD", "recent"): State your calendar assumption in one phrase (e.g. which year you mean relative to the data) and note if dataset coverage is partial.
- Vague quality ("performing well", "doing badly"): Do not answer yes/no alone. Name at least one concrete metric from the data and a comparison (e.g. vs other groups or vs another period). If the result does not support a comparison, say what is missing instead of guessing.
- Small differences: When averages or scores are close across groups, describe them as similar; do not claim a large gap unless the numbers clearly show one.
- Rates vs counts: When the user asked for a rate, per-unit, or share, describe it as such — do not imply a raw count answers a rate question.`;

function buildUserMessage(input: NarratorInput): string {
  const { question, understandingCard, primaryRows, secondaryRows, autoInsights } = input;
  return [
    `Dataset context: ${understandingCard}`,
    `User question: ${question}`,
    `Primary result: ${JSON.stringify(primaryRows.slice(0, 20))}`,
    secondaryRows && secondaryRows.length > 0
      ? `Secondary result (driver decomposition): ${JSON.stringify(secondaryRows.slice(0, 10))}`
      : 'Secondary result: null',
    autoInsights.length > 0
      ? `AutoInsights detected: ${JSON.stringify(autoInsights)}`
      : 'AutoInsights detected: none',
    '',
    'Dataset context may describe date coverage; use it when explaining time assumptions.',
    'Respond in plain English only. No markdown, no bullet points, no headers.',
  ].join('\n');
}

/** Narrator via Gemini 2.5 Flash (USE_GEMINI_NARRATOR=true). */
async function narrateWithGemini(input: NarratorInput): Promise<string> {
  const apiKey = geminiPool.next();
  const ai = new GoogleGenAI({ apiKey });
  const userMessage = buildUserMessage(input);

  const response = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
      },
    ],
  });

  const text = response.text ?? '';
  if (!text.trim()) throw new Error('Gemini returned empty narration');
  return text.trim();
}

/** Narrator via Groq Llama 4 Maverick (default). */
async function narrateWithGroq(input: NarratorInput): Promise<string> {
  const result = await runGroqQueued(() => {
    const groq = new Groq({ apiKey: groqPool.next() });
    return groq.chat.completions
      .create({
        model: env.GROQ_MODEL_NARRATOR,
        temperature: 0.3,
        max_tokens: 320,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(input) },
        ],
      })
      .withResponse();
  });

  const text = result.choices[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('Groq narrator returned empty response');
  return text.trim();
}

/**
 * §6.6 — Generate a 2-3 sentence plain-English narration of the query result.
 * Routes to Gemini Flash when USE_GEMINI_NARRATOR=true, otherwise Groq.
 * On Gemini failure, falls back to Groq automatically.
 */
export async function generateNarration(input: NarratorInput): Promise<string> {
  if (env.USE_GEMINI_NARRATOR) {
    try {
      return await narrateWithGemini(input);
    } catch {
      // Fall back to Groq on Gemini error
      return narrateWithGroq(input);
    }
  }
  return narrateWithGroq(input);
}

// ─── Short “how we answered” note (SQL analytics path only) ───────────────────

const EXPLANATION_SYSTEM = `You write a very short note for non-technical readers in a sidebar titled "How we answered".

Voice: friendly, plain English, second person ("you") and "we". No markdown, bullets, or headings.

Content (keep it minimal—not always a full paragraph):
- Sentence 1: What they asked for, in everyday words (mirror their question, not a technical rewrite).
- Sentence 2 (or same sentence, clause 2): What we looked at—use ONLY the friendly field names provided. Say "we looked at …" or "we used …". Never say "SQL", "query", "rows", "dataset", or raw snake_case identifiers if a friendly name is given.
- Do not repeat the long answer above. Do not list every value, product name, or ranking unless the question was that specific—stay high level.
- Usually 1–2 short sentences total; use 3 only if unavoidable. Aim under 45 words.

Never invent numbers or facts; only use the question text and the field names supplied.`;

export type ExplanationInput = {
  question: string;
  understandingCard: string;
  relevantColumns: string[];
  /** Human labels for relevant fields (e.g. businessLabel), same order as relevantColumns when possible. */
  columnLabels?: string[];
  narrative: string;
  primaryRows: ResultRow[];
  sql: string;
};

function capExplanation(s: string, max = 380): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function buildExplanationUserMessage(input: ExplanationInput): string {
  const uc = input.understandingCard.slice(0, 280);
  const friendly =
    input.columnLabels && input.columnLabels.length > 0
      ? input.columnLabels.join('; ')
      : input.relevantColumns.length > 0
        ? input.relevantColumns.join(', ')
        : '(field names not specified)';
  const gist =
    input.narrative.length > 200 ? `${input.narrative.slice(0, 200)}…` : input.narrative;
  return [
    `What they asked: ${input.question}`,
    `Dataset blurb (context only): ${uc}`,
    `Friendly field names to mention: ${friendly}`,
    `Answer summary (do not repeat verbatim; for tone only): ${gist}`,
    `Sample of values returned (JSON, for grounding only—do not recite): ${JSON.stringify(input.primaryRows.slice(0, 8))}`,
    '',
    'Write 1–2 short sentences as specified.',
  ].join('\n');
}

/** Deterministic trace when the query returns zero rows (no extra LLM). */
export function emptyResultExplanation(input: {
  question: string;
  relevantColumns: string[];
  columnLabels?: string[];
}): string {
  const lookedAt =
    input.columnLabels && input.columnLabels.length > 0
      ? input.columnLabels.join(', ')
      : input.relevantColumns.length > 0
        ? input.relevantColumns.join(', ')
        : 'your data';
  return capExplanation(
    `You asked a question we understood. We looked at ${lookedAt}, but nothing matched—try a wider date range, fewer filters, or rephrasing.`,
    320,
  );
}

function fallbackExplanation(input: ExplanationInput): string {
  const friendly =
    input.columnLabels && input.columnLabels.length > 0
      ? input.columnLabels.join(', ')
      : input.relevantColumns.length
        ? input.relevantColumns.join(', ')
        : 'your data';
  return capExplanation(
    `You asked a question; we used ${friendly} from your data to build the answer above.`,
    320,
  );
}

async function explainWithGroq(input: ExplanationInput): Promise<string> {
  const result = await runGroqQueued(() => {
    const groq = new Groq({ apiKey: groqPool.next() });
    return groq.chat.completions
      .create({
        model: env.GROQ_MODEL_NARRATOR,
        temperature: 0.25,
        max_tokens: 120,
        messages: [
          { role: 'system', content: EXPLANATION_SYSTEM },
          { role: 'user', content: buildExplanationUserMessage(input) },
        ],
      })
      .withResponse();
  });
  const text = result.choices[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('Groq explanation empty');
  return capExplanation(text.trim());
}

async function explainWithGemini(input: ExplanationInput): Promise<string> {
  const apiKey = geminiPool.next();
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: `${EXPLANATION_SYSTEM}\n\n${buildExplanationUserMessage(input)}` }],
      },
    ],
  });
  const text = response.text ?? '';
  if (!text.trim()) throw new Error('Gemini explanation empty');
  return capExplanation(text.trim());
}

/**
 * Short transparency note after the main narration (SQL path with rows).
 * Skipped when narration cache hits (orchestrator does not call this).
 */
export async function generateExplanation(input: ExplanationInput): Promise<string> {
  try {
    if (env.USE_GEMINI_NARRATOR) {
      try {
        return await explainWithGemini(input);
      } catch {
        return await explainWithGroq(input);
      }
    }
    return await explainWithGroq(input);
  } catch {
    return fallbackExplanation(input);
  }
}
