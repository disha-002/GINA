import { apiFetch } from '@/lib/api/client';
import { formatApiFailure } from '@/lib/api/errors';

function apiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is required');
  }
  return base.replace(/\/$/, '');
}

/** Public `GET /health` (no JWT — route is outside `/api`). */
export async function getHealth(): Promise<{ status: string }> {
  const url = `${apiBaseUrl()}/health`;
  try {
    const res = await fetch(url, { method: 'GET' });
    const contentType = res.headers.get('content-type');
    let data: unknown;
    if (contentType?.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    if (!res.ok) {
      const msg =
        typeof data === 'object' && data !== null && 'error' in data
          ? String((data as { error: string }).error)
          : `HTTP ${res.status}`;
      throw new Error(`Health check failed: ${msg}`);
    }
    return data as { status: string };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Health check failed:')) {
      throw err;
    }
    throw new Error(formatApiFailure(err, { url, method: 'GET' }));
  }
}

/** `POST /api/snapshot/toggle` — toggles in-memory snapshot mode (requires auth). */
export async function postSnapshotToggle(): Promise<{ snapshotMode: boolean }> {
  return apiFetch<{ snapshotMode: boolean }>('/api/snapshot/toggle', {
    method: 'POST',
    body: '{}',
  });
}
