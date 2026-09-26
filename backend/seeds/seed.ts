/**
 * seeds/seed.ts
 * ---------------------------------------------------------------------------
 * Demo dataset seeder for "Talk to Data".
 *
 * Creates 3 demo datasets (sunita, james, donations) with:
 *   - Dynamic PostgreSQL tables (dataset_demo_<slug>)
 *   - datasets + semantic_states rows (is_demo = true)
 *   - schema_embeddings (BAAI/bge-small-en-v1.5 via HuggingFace Inference API)
 *
 * Run from backend/ root:
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs seeds/seed.ts
 *
 * Re-running is safe: existing demo data is cleaned up before re-inserting.
 * ---------------------------------------------------------------------------
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';
import pgvector from 'pgvector/pg';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Demo system user ─────────────────────────────────────────────────────────
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_USER_EMAIL = 'demo@talktodata.gina';

// ── Column descriptor ─────────────────────────────────────────────────────────
type PostgresType = 'DATE' | 'NUMERIC' | 'TEXT';

type ColumnConfig = {
  columnName: string;
  postgresType: PostgresType;
  businessLabel: string;
  semanticType: string;
  currency: string | null;
  description: string;
  sampleValues: string[];
  nullPct: number;
  uniqueCount: number;
  valueRange: { min: string; max: string } | null;
};

type DemoDataset = {
  slug: string;
  csvFile: string;
  displayName: string;
  tableName: string;
  understandingCard: string;
  columns: ColumnConfig[];
};

// ── Inline semantic profiles (mirrors semantic_yaml/*.yaml) ──────────────────

const SUNITA: DemoDataset = {
  slug: 'sunita',
  csvFile: join(__dirname, 'sunita_sme_expenses.csv'),
  displayName: 'sunita_sme_expenses.csv',
  tableName: 'dataset_demo_sunita',
  understandingCard:
    'Looks like an SME energy expense tracker with 80 records across Q1 2024. We read amount as your net spend in GBP, category as expense type, and sustainability_flag as your green spend indicator.',
  columns: [
    {
      columnName: 'date',
      postgresType: 'DATE',
      businessLabel: 'Transaction Date',
      semanticType: 'date',
      currency: null,
      description: 'The date the expense was recorded',
      sampleValues: ['2024-01-05', '2024-02-12', '2024-03-20'],
      nullPct: 0,
      uniqueCount: 80,
      valueRange: { min: '2024-01-02', max: '2024-03-31' },
    },
    {
      columnName: 'amount',
      postgresType: 'NUMERIC',
      businessLabel: 'Net Spend (GBP)',
      semanticType: 'amount',
      currency: 'GBP',
      description: 'Net expense amount in GBP',
      sampleValues: ['1200.00', '340.50', '875.00'],
      nullPct: 0,
      uniqueCount: 73,
      valueRange: { min: '260.00', max: '8400.00' },
    },
    {
      columnName: 'category',
      postgresType: 'TEXT',
      businessLabel: 'Expense Category',
      semanticType: 'category',
      currency: null,
      description: 'Type of business expense (energy, travel, equipment, etc.)',
      sampleValues: ['Solar & Renewables', 'LED Lighting', 'EV Charging', 'Gas Heating', 'Fleet Diesel'],
      nullPct: 0,
      uniqueCount: 7,
      valueRange: null,
    },
    {
      columnName: 'sustainability_flag',
      postgresType: 'TEXT',
      businessLabel: 'Green Spend Indicator',
      semanticType: 'flag',
      currency: null,
      description:
        'Indicates whether the expense is classified as sustainable (Y) or non-sustainable (N)',
      sampleValues: ['Y', 'N'],
      nullPct: 0,
      uniqueCount: 2,
      valueRange: null,
    },
  ],
};

const JAMES: DemoDataset = {
  slug: 'james',
  csvFile: join(__dirname, 'james_charity_grants.csv'),
  displayName: 'james_charity_grants.csv',
  tableName: 'dataset_demo_james',
  understandingCard:
    'Tracks UK charity grant allocations across 2023-2024, with awarded_amount showing committed funding and spent_amount reflecting actual disbursements across focus areas and regions.',
  columns: [
    {
      columnName: 'grant_date',
      postgresType: 'DATE',
      businessLabel: 'Grant Date',
      semanticType: 'date',
      currency: null,
      description: 'The date the grant was awarded',
      sampleValues: ['2023-04-03', '2023-07-11', '2024-01-22'],
      nullPct: 0,
      uniqueCount: 60,
      valueRange: { min: '2023-04-03', max: '2024-03-31' },
    },
    {
      columnName: 'charity_name',
      postgresType: 'TEXT',
      businessLabel: 'Charity Name',
      semanticType: 'category',
      currency: null,
      description: 'The name of the charity receiving the grant',
      sampleValues: [
        'Mind & Matter Trust',
        'Green Futures CIC',
        'Literacy First',
        'Wellbeing Alliance',
        'YouthPath UK',
      ],
      nullPct: 0,
      uniqueCount: 15,
      valueRange: null,
    },
    {
      columnName: 'project',
      postgresType: 'TEXT',
      businessLabel: 'Project Name',
      semanticType: 'text',
      currency: null,
      description: 'The specific project or programme funded by the grant',
      sampleValues: [
        'Mental Health Outreach',
        'Community Allotments',
        'After-School Reading',
        'Solar Panel Installation',
        'Crisis Support Line',
      ],
      nullPct: 0,
      uniqueCount: 60,
      valueRange: null,
    },
    {
      columnName: 'awarded_amount',
      postgresType: 'NUMERIC',
      businessLabel: 'Awarded Amount (GBP)',
      semanticType: 'amount',
      currency: 'GBP',
      description: 'Total amount of funding committed for the project in GBP',
      sampleValues: ['15000.00', '8500.00', '22000.00', '45000.00', '6000.00'],
      nullPct: 0,
      uniqueCount: 32,
      valueRange: { min: '3500.00', max: '50000.00' },
    },
    {
      columnName: 'spent_amount',
      postgresType: 'NUMERIC',
      businessLabel: 'Amount Spent (GBP)',
      semanticType: 'amount',
      currency: 'GBP',
      description:
        'Actual amount disbursed to date for the project in GBP. Some grants show 0.00 where spending has not yet begun.',
      sampleValues: ['12400.00', '8500.00', '18700.00', '38000.00', '5900.00'],
      nullPct: 0,
      uniqueCount: 48,
      valueRange: { min: '0.00', max: '38000.00' },
    },
    {
      columnName: 'region',
      postgresType: 'TEXT',
      businessLabel: 'UK Region',
      semanticType: 'category',
      currency: null,
      description: 'UK geographic region where the charity primarily operates',
      sampleValues: ['London', 'North West', 'Yorkshire', 'South East', 'Midlands'],
      nullPct: 0,
      uniqueCount: 7,
      valueRange: null,
    },
    {
      columnName: 'focus_area',
      postgresType: 'TEXT',
      businessLabel: 'Focus Area',
      semanticType: 'category',
      currency: null,
      description: 'Primary area of charitable activity or social impact',
      sampleValues: ['Health', 'Environment', 'Education', 'Community Development'],
      nullPct: 0,
      uniqueCount: 4,
      valueRange: null,
    },
  ],
};

const DONATIONS: DemoDataset = {
  slug: 'donations',
  csvFile: join(__dirname, 'charity_donations.csv'),
  displayName: 'charity_donations.csv',
  tableName: 'dataset_demo_donations',
  understandingCard:
    'Records 100 individual donations across five fundraising campaigns in 2023-2024, tracking amounts, payment methods, and anonymous donor references for charity income planning.',
  columns: [
    {
      columnName: 'donation_date',
      postgresType: 'DATE',
      businessLabel: 'Donation Date',
      semanticType: 'date',
      currency: null,
      description: 'The date the donation was received',
      sampleValues: ['2023-01-05', '2023-06-09', '2024-01-14'],
      nullPct: 0,
      uniqueCount: 98,
      valueRange: { min: '2023-01-05', max: '2024-03-31' },
    },
    {
      columnName: 'donor_ref',
      postgresType: 'TEXT',
      businessLabel: 'Donor Reference',
      semanticType: 'identifier',
      currency: null,
      description:
        'Anonymous donor reference code. Donors may give multiple times across different campaigns.',
      sampleValues: ['D001', 'D012', 'D023', 'D045', 'D007'],
      nullPct: 0,
      uniqueCount: 50,
      valueRange: null,
    },
    {
      columnName: 'amount',
      postgresType: 'NUMERIC',
      businessLabel: 'Donation Amount (GBP)',
      semanticType: 'amount',
      currency: 'GBP',
      description: 'Value of the donation in GBP',
      sampleValues: ['150.00', '500.00', '5000.00', '75.00', '1000.00'],
      nullPct: 0,
      uniqueCount: 60,
      valueRange: { min: '25.00', max: '5000.00' },
    },
    {
      columnName: 'campaign',
      postgresType: 'TEXT',
      businessLabel: 'Fundraising Campaign',
      semanticType: 'category',
      currency: null,
      description: 'The named fundraising campaign the donation was attributed to',
      sampleValues: [
        'Warmth for Winter',
        'Plant a Tree',
        'Meals on Wheels',
        'Digital Divide',
        'Youth Futures',
      ],
      nullPct: 0,
      uniqueCount: 5,
      valueRange: null,
    },
    {
      columnName: 'payment_method',
      postgresType: 'TEXT',
      businessLabel: 'Payment Method',
      semanticType: 'category',
      currency: null,
      description: 'How the donation was made',
      sampleValues: ['Card', 'Bank Transfer', 'Direct Debit', 'Cheque'],
      nullPct: 0,
      uniqueCount: 4,
      valueRange: null,
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildColumnEmbeddingText(col: ColumnConfig): string {
  const samples = col.sampleValues.slice(0, 5).join(', ');
  return `${col.businessLabel}: ${col.description}. Sample values: ${samples}`;
}

/**
 * Embed a batch of texts via the HuggingFace Inference API.
 * Retries once if the model is still loading (HTTP 503).
 */
async function embedBatch(texts: string[], apiKey: string, model: string): Promise<number[][]> {
  const encodedModel = model.split('/').map(encodeURIComponent).join('/');
  const url = `https://router.huggingface.co/hf-inference/models/${encodedModel}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: texts }),
    });

    if (res.status === 503) {
      let waitSec = 20;
      try {
        const json = (await res.json()) as { estimated_time?: number };
        waitSec = Math.min(json.estimated_time ?? 20, 60);
      } catch {
        // ignore parse error
      }
      console.log(`  HF model loading — waiting ${waitSec}s (attempt ${attempt + 1}/3)...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HF API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as number[][];
    if (!Array.isArray(data)) throw new Error('Unexpected HF response format');
    return data;
  }
  throw new Error('HF API failed after 3 attempts');
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = process.env['HF_API_KEY_1'];
  if (!key) throw new Error('HF_API_KEY_1 not set in environment');

  const model = process.env['EMBEDDING_HF_MODEL'] ?? 'BAAI/bge-small-en-v1.5';
  const BATCH = 16;
  const result: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const vecs = await embedBatch(batch, key, model);
    result.push(...vecs);
  }
  return result;
}

/** Coerce a CSV string value to the right JS type for a parameterised pg query. */
function coerce(value: string | undefined, type: PostgresType): string | number | null {
  const v = (value ?? '').trim();
  if (v === '') return null;
  if (type === 'NUMERIC') {
    const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? null : n;
  }
  // DATE and TEXT: pass the string as-is; pg handles ISO date parsing
  return v;
}

// ── Core seeder ──────────────────────────────────────────────────────────────

async function seedDataset(pool: Pool, dataset: DemoDataset): Promise<void> {
  console.log(`\n── Seeding "${dataset.displayName}" ──`);

  // 1. Parse CSV
  const csvText = readFileSync(dataset.csvFile, 'utf-8');
  const { data: rows, errors } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length > 0) {
    console.warn(`  CSV parse warnings: ${JSON.stringify(errors.slice(0, 3))}`);
  }
  console.log(`  Parsed ${rows.length} rows`);

  // 2. Generate embeddings BEFORE touching the DB (fail early)
  console.log(`  Generating ${dataset.columns.length} column embeddings via HuggingFace...`);
  const embeddingTexts = dataset.columns.map(buildColumnEmbeddingText);
  const vectors = await embedTexts(embeddingTexts);

  if (vectors.length !== dataset.columns.length) {
    throw new Error(
      `Embedding count mismatch: expected ${dataset.columns.length}, got ${vectors.length}`,
    );
  }
  if (vectors.some((v) => v.length !== 384)) {
    const dims = vectors.map((v) => v.length).join(', ');
    throw new Error(`Unexpected embedding dimensions (all must be 384): [${dims}]`);
  }
  console.log(`  Embeddings OK: ${vectors.length} × 384`);

  // 3. Run everything in a single transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clean up any previous seeding for this slug
    await client.query(`DELETE FROM datasets WHERE demo_slug = $1`, [dataset.slug]);
    await client.query(`DROP TABLE IF EXISTS "${dataset.tableName}"`);

    // Create dynamic table
    const columnDDL = dataset.columns
      .map((c) => `"${c.columnName}" ${c.postgresType}`)
      .join(',\n  ');

    await client.query(`
      CREATE TABLE "${dataset.tableName}" (
        _row_id SERIAL PRIMARY KEY,
        ${columnDDL}
      )
    `);

    // Grant SELECT to readonly_agent (best-effort — role may not exist until Phase 3)
    await client.query('SAVEPOINT sp_grant');
    try {
      await client.query(`GRANT SELECT ON "${dataset.tableName}" TO readonly_agent`);
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT sp_grant');
      console.log(`  ℹ  readonly_agent role not found; GRANT skipped`);
    }
    await client.query('RELEASE SAVEPOINT sp_grant');

    // Bulk-insert CSV rows (batches of 500)
    if (rows.length > 0) {
      const BATCH = 500;
      const quotedCols = dataset.columns.map((c) => `"${c.columnName}"`).join(', ');

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const placeholders = batch
          .map((_, bi) => {
            const offset = bi * dataset.columns.length;
            return (
              '(' +
              dataset.columns.map((_, ci) => `$${offset + ci + 1}`).join(', ') +
              ')'
            );
          })
          .join(', ');
        const values = batch.flatMap((row) =>
          dataset.columns.map((c) => coerce(row[c.columnName], c.postgresType)),
        );
        await client.query(
          `INSERT INTO "${dataset.tableName}" (${quotedCols}) VALUES ${placeholders}`,
          values,
        );
      }
    }
    console.log(`  Inserted ${rows.length} rows → ${dataset.tableName}`);

    // Insert datasets row
    const datasetId = randomUUID();
    const schemaJson = {
      tableName: dataset.tableName,
      columns: dataset.columns,
      understandingCard: dataset.understandingCard,
    };

    await client.query(
      `INSERT INTO datasets
         (id, user_id, name, s3_key, row_count, column_count, is_demo, demo_slug, data_table_name)
       VALUES ($1, $2, $3, null, $4, $5, true, $6, $7)`,
      [
        datasetId,
        DEMO_USER_ID,
        dataset.displayName,
        rows.length,
        dataset.columns.length,
        dataset.slug,
        dataset.tableName,
      ],
    );

    // Insert semantic_states row
    await client.query(
      `INSERT INTO semantic_states (dataset_id, schema_json, understanding_card)
       VALUES ($1, $2::jsonb, $3)`,
      [datasetId, JSON.stringify(schemaJson), dataset.understandingCard],
    );

    // Insert schema_embeddings
    await pgvector.registerTypes(client);
    for (let i = 0; i < dataset.columns.length; i++) {
      const col = dataset.columns[i]!;
      const embText = embeddingTexts[i]!;
      const vec = vectors[i]!;
      await client.query(
        `INSERT INTO schema_embeddings (dataset_id, column_name, embedding_text, embedding)
         VALUES ($1::uuid, $2, $3, $4::vector)`,
        [datasetId, col.columnName, embText, pgvector.toSql(vec)],
      );
    }

    await client.query('COMMIT');
    console.log(`  ✅ Done  (dataset_id=${datasetId})`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString: dbUrl });

  try {
    // Ensure the demo system user exists
    await pool.query(
      `INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [DEMO_USER_ID, DEMO_USER_EMAIL],
    );
    console.log(`✅ Demo user ready (${DEMO_USER_ID})`);

    await seedDataset(pool, SUNITA);
    await seedDataset(pool, JAMES);
    await seedDataset(pool, DONATIONS);

    console.log('\n✅ All 3 demo datasets seeded successfully.');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('\n❌ Seed script failed:', err);
  process.exit(1);
});
