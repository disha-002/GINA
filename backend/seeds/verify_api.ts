/**
 * Phase 2 API verification gates 1–4 and 10
 * Requires the server to be running on localhost:3001
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE = 'http://localhost:3001';
const JWT =
  'eyJhbGciOiJFUzI1NiIsImtpZCI6IjM0ZDFhZDhiLTQ0ZTQtNGIyOS04YTkyLWFlN2UwMTk3OTUwMSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3N2YmJpbGR2amp4ZmJ3b29zYmdjLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI5MTBmMTA5Yy1jYTUwLTRjOTctYWNmYi04N2ViNzg1YTkzN2UiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc1OTUxMjU3LCJpYXQiOjE3NzU5NDc2NTcsImVtYWlsIjoidmVyaWZ5X3BoYXNlMkB0YWxrdG9kYXRhLnRlc3QiLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsX3ZlcmlmaWVkIjp0cnVlfSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc3NTk0NzY1N31dLCJzZXNzaW9uX2lkIjoiYmIxNTkxMmMtOTE2MS00ZDUxLWI2NjYtMGVjZDk5YWZhNmRiIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.-Ihqp0YAps0L_vf8NA2nAqkzncSSHioi_nvFyob_iIlmFTRo69_lOxD37nZV-LNq1f1Ffd0UyZaxB0PKf6HDTw';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

function auth(): Record<string, string> {
  return { Authorization: `Bearer ${JWT}` };
}

let allPass = true;
function pass(gate: number, msg: string) {
  console.log(`  ✅ Gate ${gate} PASS — ${msg}`);
}
function fail(gate: number, msg: string) {
  console.log(`  ❌ Gate ${gate} FAIL — ${msg}`);
  allPass = false;
}

// ── Step 0: sync user ────────────────────────────────────────────────────────
console.log('\n── Step 0: syncing test user ──');
const syncRes = await fetch(`${BASE}/api/users/sync`, {
  method: 'POST',
  headers: { ...auth(), 'Content-Type': 'application/json' },
  body: '{}',
});
if (!syncRes.ok) {
  console.error('User sync failed:', syncRes.status, await syncRes.text());
  process.exit(1);
}
const { user: syncedUser } = (await syncRes.json()) as { user: { id: string } };
console.log('  Synced user:', syncedUser.id);

// ── Step 1: upload a test CSV ─────────────────────────────────────────────────
console.log('\n── Gates 1–4: CSV upload ──');
console.log('  Uploading 5-row test CSV (includes Groq + HF enrichment)...');

const testCsv = 'date,amount,description\n2024-01-01,100.00,Coffee\n2024-01-02,250.00,Lunch\n2024-01-03,50.00,Transport\n2024-01-04,400.00,Equipment\n2024-01-05,175.00,Software';

const form = new FormData();
form.append('file', new Blob([testCsv], { type: 'text/csv' }), 'phase2_test.csv');

const uploadRes = await fetch(`${BASE}/api/datasets/upload`, {
  method: 'POST',
  headers: auth(),
  body: form,
});

if (!uploadRes.ok) {
  const body = await uploadRes.text();
  fail(1, `Upload returned ${uploadRes.status}: ${body.slice(0, 200)}`);
  process.exit(1);
}

const uploadBody = (await uploadRes.json()) as {
  dataset: { id: string; name: string; rowCount: number; columnCount: number };
  semanticState: { id: string; schemaJson: { tableName: string }; understandingCard: string };
  understandingCard: string;
  piiSummary: unknown;
};

// Gate 1: response shape
if (
  uploadBody.dataset &&
  uploadBody.semanticState &&
  uploadBody.understandingCard &&
  uploadBody.piiSummary !== undefined
) {
  pass(1, `Upload 200 — dataset=${uploadBody.dataset.id}, card="${uploadBody.understandingCard.slice(0, 60)}..."`);
} else {
  fail(1, `Response missing expected fields: ${JSON.stringify(Object.keys(uploadBody))}`);
}

const { dataset, semanticState } = uploadBody;
const tableName = semanticState.schemaJson.tableName;
console.log(`  tableName: ${tableName}`);

// Gate 2: dynamic table exists with correct columns
try {
  const { rows: tableInfo } = await pool.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [tableName],
  );
  const colNames = tableInfo.map((r) => r.column_name);
  if (colNames.includes('date') && colNames.includes('amount') && colNames.includes('description')) {
    pass(2, `Table "${tableName}" has columns: ${colNames.join(', ')}`);
  } else {
    fail(2, `Table columns unexpected: ${colNames.join(', ')}`);
  }
} catch (e: unknown) {
  fail(2, String(e));
}

// Gate 3: row count matches CSV
try {
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM "${tableName}"`,
  );
  const count = parseInt(countRows[0]!.count, 10);
  if (count === 5) {
    pass(3, `Row count = ${count} (matches CSV)`);
  } else {
    fail(3, `Row count = ${count}, expected 5`);
  }
} catch (e: unknown) {
  fail(3, String(e));
}

// Gate 4: S3 key stored (we verify s3_key is non-null in DB, not actual S3 object)
try {
  const { rows } = await pool.query<{ s3_key: string | null }>(
    `SELECT s3_key FROM datasets WHERE id = $1`,
    [dataset.id],
  );
  const s3key = rows[0]?.s3_key;
  if (s3key && s3key.startsWith('uploads/')) {
    pass(4, `S3 key stored: ${s3key}`);
  } else {
    fail(4, `S3 key = ${s3key}`);
  }
} catch (e: unknown) {
  fail(4, String(e));
}

// ── Gate 10: PATCH semantic ───────────────────────────────────────────────────
console.log('\n── Gate 10: PATCH /api/datasets/:id/semantic ──');

const patchBody = {
  corrections: [
    {
      columnName: 'amount',
      newSemanticType: 'amount',
      newBusinessLabel: 'Total Spend (GBP)',
      newDescription: 'Corrected: net spend amount in GBP',
    },
  ],
};

const patchRes = await fetch(`${BASE}/api/datasets/${dataset.id}/semantic`, {
  method: 'PATCH',
  headers: { ...auth(), 'Content-Type': 'application/json' },
  body: JSON.stringify(patchBody),
});

if (!patchRes.ok) {
  const body = await patchRes.text();
  fail(10, `PATCH returned ${patchRes.status}: ${body.slice(0, 200)}`);
} else {
  const patchData = (await patchRes.json()) as { isUserCorrected: boolean; updatedAt: string };
  if (patchData.isUserCorrected === true) {
    pass(10, `PATCH 200, isUserCorrected=true, updatedAt=${patchData.updatedAt}`);
  } else {
    fail(10, `PATCH returned isUserCorrected=${patchData.isUserCorrected}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n');
if (allPass) {
  console.log('✅ All API gates passed!');
} else {
  console.log('⚠️  Some gates failed — see above');
}

await pool.end();
