import pg from 'pg';
import { env } from '../src/config/env.js';

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const r = await pool.query(
  `SELECT id, name, demo_slug, is_demo, user_id 
   FROM datasets 
   WHERE demo_slug = 'sunita' OR name ILIKE '%sunita%'`
);
console.log('Datasets:', JSON.stringify(r.rows, null, 2));
await pool.end();
