import type { NextRequest } from 'next/server';

/**
 * Public site origin for the **current** deployment.
 *
 * On Vercel, `new URL(request.url).origin` can be wrong in route handlers when the
 * internal host differs from the public hostname. Prefer `x-forwarded-host` +
 * `x-forwarded-proto` when present.
 */
export function getSiteOriginFromRequest(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

  if (forwardedHost) {
    const proto =
      forwardedProto && forwardedProto.length > 0 ? forwardedProto : 'https';
    return `${proto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

/**
 * OAuth redirect target after Supabase / IdP completes.
 * In the browser, always use `window.location.origin` so preview deployments and
 * production URLs work without env mistakes (a wrong `NEXT_PUBLIC_SITE_URL` must not
 * override the page the user is actually on).
 */
export function getOAuthCallbackUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  return `${explicit ?? 'http://localhost:3000'}/auth/callback`;
}
