// Get a test JWT by signing in via Supabase REST auth endpoint.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['SUPABASE_URL']!;
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']!;

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_EMAIL = 'verify_phase2@talktodata.test';
const TEST_PASSWORD = 'VerifyPhase2_2026!';

// Create test user if not exists
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
  email_confirm: true,
});
if (createErr && !createErr.message.toLowerCase().includes('already')) {
  console.error('Create user error:', createErr.message);
  process.exit(1);
}
console.log('Test user ready:', TEST_EMAIL);

// Sign in via the REST password grant (service role key works as apikey for the password endpoint)
const signInRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: serviceKey,
  },
  body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
});

if (!signInRes.ok) {
  const body = await signInRes.text();
  console.error('Sign-in failed:', signInRes.status, body);
  process.exit(1);
}

const { access_token, user } = (await signInRes.json()) as {
  access_token: string;
  user: { id: string; email: string };
};

console.log('\n=== TEST JWT ===');
console.log(access_token);
console.log('\nUser ID:', user.id);
console.log('Email:', user.email);
