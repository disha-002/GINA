import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env['DATABASE_URL']! });

// Grant readonly_agent role to the current postgres user
const userResult = await pool.query('SELECT current_user, session_user');
const currentUser = userResult.rows[0].current_user as string;
console.log('Current DB user:', currentUser);

// Grant the role so SET ROLE readonly_agent works
try {
  await pool.query(`GRANT readonly_agent TO "${currentUser}"`);
  console.log(`✅ GRANT readonly_agent TO ${currentUser} — success`);
} catch (e: unknown) {
  const msg = String(e);
  if (msg.includes('already a member')) {
    console.log('ℹ️  Already a member of readonly_agent — OK');
  } else {
    console.error('❌ GRANT failed:', msg);
  }
}

await pool.end();
