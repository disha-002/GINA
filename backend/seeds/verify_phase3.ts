/**
 * Phase 3 verification — 10 gates covering Person A (3B) and Person B (3A).
 * Run with: node --env-file=.env node_modules/tsx/dist/cli.mjs seeds/verify_phase3.ts
 */

import pg from 'pg';
import { env } from '../src/config/env.js';
import { runPlanner } from '../src/pipeline/planner.js';
import { tryTemplateSql } from '../src/pipeline/sqlTemplates.js';
import { validateSql } from '../src/pipeline/sqlValidator.js';
import { executeReadOnlySql } from '../src/pipeline/dbExecutor.js';
import { detectAutoInsights, computeConfidence, selectChartType } from '../src/pipeline/autoInsight.js';
import { generateNarration } from '../src/pipeline/narrator.js';
import type { ColumnProfile } from '../src/semantic/profiler.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label: string, info = '') {
  passed++;
  console.log(`  ✅  [PASS] ${label}${info ? ' — ' + info : ''}`);
}

function fail(label: string, reason: string) {
  failed++;
  console.error(`  ❌  [FAIL] ${label} — ${reason}`);
}

async function check(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    fail(label, String(e));
  }
}

// ─── setup ────────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

// Dummy Sunita column profiles (sufficient for most gates)
const sunitaColumns: ColumnProfile[] = [
  {
    columnName: 'amount',
    semanticType: 'amount',
    postgresType: 'numeric',
    businessLabel: 'Amount',
    description: 'Transaction amount in GBP',
    sampleValues: ['14200', '7800', '5200'],
    uniqueCount: 80,
    nullPct: 0,
    minVal: 100,
    maxVal: 50000,
  },
  {
    columnName: 'category',
    semanticType: 'category',
    postgresType: 'text',
    businessLabel: 'Category',
    description: 'Spending category',
    sampleValues: ['Solar Equipment', 'Wind Power', 'Energy Audits'],
    uniqueCount: 12,
    nullPct: 0,
  },
  {
    columnName: 'date',
    semanticType: 'date',
    postgresType: 'date',
    businessLabel: 'Date',
    description: 'Transaction date',
    sampleValues: ['2024-01-15'],
    uniqueCount: 80,
    nullPct: 0,
  },
];

async function main() {
  console.log('\n========== Phase 3 Verification (10 gates) ==========\n');

  // ─── Gate 1: Planner returns valid JSON for a simple question ───────────────
  await check('Gate 1 — Planner: valid JSON for "What were my top expenses?"', async () => {
    const result = await runPlanner({
      question: 'What were my top expenses?',
      columns: sunitaColumns,
    });
    if (!result.intent) throw new Error('Missing intent');
    if (!Array.isArray(result.relevantColumns)) throw new Error('Missing relevantColumns');
    ok('Gate 1', `intent=${result.intent}, cols=${result.relevantColumns.length}`);
  });

  // ─── Gate 2: SQL templates generate valid SQL ────────────────────────────────
  await check('Gate 2 — SQL Templates: generate SQL for "What was my total spending?"', async () => {
    const sql = tryTemplateSql('What was my total spending?', 'dataset_demo_sunita', sunitaColumns);
    if (!sql) throw new Error('Template returned null');
    if (!sql.toLowerCase().includes('select')) throw new Error('Not a SELECT');
    ok('Gate 2', sql.substring(0, 80));
  });

  // ─── Gate 3: SQL validator accepts valid SELECT ──────────────────────────────
  await check('Gate 3 — SQL Validator: accepts valid SELECT', async () => {
    const r = validateSql(
      'SELECT category, SUM(amount) FROM dataset_demo_sunita GROUP BY category',
      ['dataset_demo_sunita'],
    );
    if (!r.valid) throw new Error(`Rejected valid SQL: ${(r as { reason: string }).reason}`);
    ok('Gate 3', 'valid SELECT accepted');
  });

  // ─── Gate 4: SQL validator rejects DROP TABLE ────────────────────────────────
  await check('Gate 4 — SQL Validator: rejects DROP TABLE', async () => {
    const r = validateSql('DROP TABLE dataset_demo_sunita', ['dataset_demo_sunita']);
    if (r.valid) throw new Error('Should have rejected DROP TABLE');
    ok('Gate 4', `reason: ${(r as { reason: string }).reason}`);
  });

  // ─── Gate 5: SQL validator rejects wrong table ───────────────────────────────
  await check('Gate 5 — SQL Validator: rejects unknown table reference', async () => {
    const r = validateSql(
      'SELECT * FROM users',
      ['dataset_demo_sunita'],
    );
    if (r.valid) throw new Error('Should have rejected unknown table');
    ok('Gate 5', `reason: ${(r as { reason: string }).reason}`);
  });

  // ─── Gate 6: DB executor runs read-only SQL against real DB ─────────────────
  await check('Gate 6 — DB Executor: runs read-only SQL against demo data', async () => {
    const result = await executeReadOnlySql(
      pool,
      'SELECT COUNT(*) AS cnt FROM dataset_demo_sunita',
    );
    const cnt = Number(result.rows[0]?.cnt ?? 0);
    if (cnt === 0) throw new Error('Expected >0 rows in demo table');
    ok('Gate 6', `rowCount=${cnt} rows in demo table`);
  });

  // ─── Gate 7: DB executor rejects INSERT via readonly_agent ──────────────────
  await check('Gate 7 — DB Executor: readonly_agent cannot INSERT', async () => {
    try {
      await executeReadOnlySql(
        pool,
        "INSERT INTO dataset_demo_sunita (amount) VALUES (1)",
      );
      throw new Error('INSERT should have been rejected');
    } catch (e) {
      const msg = String(e);
      if (msg.includes('should have been rejected')) throw e;
      // Any pg error == INSERT blocked by role == PASS
      ok('Gate 7', `INSERT blocked: ${msg.substring(0, 80)}`);
    }
  });

  // ─── Gate 8: AutoInsight detects concentration ───────────────────────────────
  await check('Gate 8 — AutoInsight: detects concentration (top item > 50%)', async () => {
    const rows = [
      { category: 'Solar Equipment', total: 14200 },
      { category: 'Wind Power', total: 3000 },
      { category: 'Audits', total: 1000 },
    ];
    const insights = detectAutoInsights(rows, sunitaColumns);
    const concentration = insights.find((i) => i.includes('%'));
    if (!concentration) throw new Error(`No concentration insight. Insights: ${JSON.stringify(insights)}`);
    ok('Gate 8', concentration);
  });

  // ─── Gate 9: Narrator returns 2-3 sentence plain English ────────────────────
  await check('Gate 9 — Narrator: 2-3 sentences plain English', async () => {
    const narration = await generateNarration({
      question: 'What were my top spending categories?',
      understandingCard: 'SME expense data for Sunita, covering 80 transactions.',
      primaryRows: [
        { category: 'Solar Equipment', total: 14200 },
        { category: 'Wind Power', total: 7800 },
      ],
      autoInsights: [],
    });
    if (!narration || narration.length < 20) throw new Error(`Too short: "${narration}"`);
    if (narration.includes('**') || narration.includes('## ') || narration.includes('- ')) {
      throw new Error(`Contains markdown: "${narration.substring(0, 200)}"`);
    }
    ok('Gate 9', `narration="${narration.substring(0, 100)}..."`);
  });

  // ─── Gate 10: Chart type returns correct type ────────────────────────────────
  await check('Gate 10 — Chart type: correct selection', async () => {
    // big_number
    const bigNum = selectChartType([{ total: 142400 }], 'simple_query', 'total spending');
    if (bigNum !== 'big_number') throw new Error(`Expected big_number, got ${bigNum}`);

    // bar — multi-row with category + numeric
    const bar = selectChartType(
      [{ category: 'Solar', total: 14200 }, { category: 'Wind', total: 7800 }],
      'simple_query',
      'top categories',
    );
    if (bar !== 'bar') throw new Error(`Expected bar, got ${bar}`);

    // line — date column present
    const line = selectChartType(
      [{ month: '2024-01', total: 5000 }, { month: '2024-02', total: 6000 }],
      'simple_query',
      'trend by month',
    );
    if (line !== 'line') throw new Error(`Expected line, got ${line}`);

    ok('Gate 10', `big_number ✓  bar ✓  line ✓`);
  });

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  Phase 3 result:  ${passed} passed / ${failed} failed`);
  console.log(`══════════════════════════════════════════════════\n`);

  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
