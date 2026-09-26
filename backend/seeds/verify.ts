// Phase 2 verification script
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

try {
  console.log('\n=== Gate 8: Demo datasets (expect 3 rows) ===');
  const g8 = await pool.query(
    `SELECT name, is_demo, demo_slug FROM datasets WHERE is_demo = true ORDER BY demo_slug`,
  );
  console.table(g8.rows);

  console.log('\n=== Gate 9: Demo table row counts ===');
  const counts = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM dataset_demo_sunita`),
    pool.query(`SELECT COUNT(*) FROM dataset_demo_james`),
    pool.query(`SELECT COUNT(*) FROM dataset_demo_donations`),
  ]);
  console.log('dataset_demo_sunita:  ', counts[0].rows[0].count, '(expect 80)');
  console.log('dataset_demo_james:   ', counts[1].rows[0].count, '(expect 60)');
  console.log('dataset_demo_donations:', counts[2].rows[0].count, '(expect 100)');

  console.log('\n=== Gate 5: Understanding cards ===');
  const g5 = await pool.query(
    `SELECT d.demo_slug,
            LEFT(s.understanding_card, 60) AS card_preview,
            s.understanding_card IS NOT NULL AS has_card
     FROM datasets d
     JOIN semantic_states s ON s.dataset_id = d.id
     WHERE d.is_demo = true
     ORDER BY d.demo_slug`,
  );
  console.table(g5.rows);

  console.log('\n=== Gate 6: Schema embeddings (expect 16 rows total, all 384-dim) ===');
  const g6 = await pool.query(
    `SELECT d.demo_slug,
            COUNT(e.id)::int AS embed_count,
            SUM(CASE WHEN vector_dims(e.embedding) = 384 THEN 1 ELSE 0 END)::int AS correct_dims
     FROM datasets d
     JOIN schema_embeddings e ON e.dataset_id = d.id
     WHERE d.is_demo = true
     GROUP BY d.demo_slug
     ORDER BY d.demo_slug`,
  );
  console.table(g6.rows);

  console.log('\n✅ All gates checked.');
} finally {
  await pool.end();
}
