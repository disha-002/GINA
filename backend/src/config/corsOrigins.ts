/**
 * Phase 7 — CORS allow-list: localhost dev defaults + optional env (Vercel, etc.).
 */
const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003',
  'http://127.0.0.1:5173',
];

export function buildCorsAllowedOrigins(extraCsv: string): Set<string> {
  const extra = extraCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_DEV_ORIGINS, ...extra]);
}
