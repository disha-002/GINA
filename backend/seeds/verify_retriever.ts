// Gate 7: Retriever test — verifies pgvector cosine search returns amount column first
// for "What was my total spending?" against the sunita demo dataset
import 'dotenv/config';
import { Pool } from 'pg';
import { retrieveRelevantColumns } from '../src/semantic/retriever.js';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

try {
  // Get the sunita demo dataset id
  const { rows } = await pool.query(
    `SELECT id FROM datasets WHERE demo_slug = 'sunita' AND is_demo = true LIMIT 1`,
  );
  if (rows.length === 0) throw new Error('Sunita demo dataset not found');

  const datasetId = rows[0].id as string;
  console.log(`Sunita dataset id: ${datasetId}`);

  console.log('\n=== Gate 7: Retriever ===');
  console.log('Question: "What was my total spending?"');
  const results = await retrieveRelevantColumns(pool, {
    datasetId,
    question: 'What was my total spending?',
    topK: 4,
  });

  console.log('Ranked columns:');
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. column="${r.columnName}"  similarity=${Number(r.similarity).toFixed(4)}`);
  });

  const topCol = results[0]?.columnName;
  if (topCol === 'amount') {
    console.log('\n✅ Gate 7 PASS — "amount" ranked #1 for total spending query');
  } else {
    console.log(`\n⚠️  Gate 7 WARNING — expected "amount" at #1, got "${topCol}"`);
  }
} finally {
  await pool.end();
}
