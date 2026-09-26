import { createBrowserClient } from '@supabase/ssr';
import { formatApiFailure, messageFromApiErrorPayload } from '@/lib/api/errors';

/**
 * Typed fetch wrapper that automatically attaches JWT from Supabase session
 * Used for all non-SSE requests
 */

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_BASE_URL is required');
}

/**
 * Typed fetch wrapper with JWT authentication
 * Automatically attaches Authorization header from Supabase session
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit & { method?: string } = {}
): Promise<T> {
  const method = options.method ?? 'GET';
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    // Get the current session
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error(
        'No authentication token available. Try signing out and back in, or refresh the page.'
      );
    }

    // Build request headers
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${session.access_token}`);

    // Don't override Content-Type if already set (e.g., for multipart)
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Parse response
    const contentType = response.headers.get('content-type');
    let data: unknown;

    if (contentType?.includes('application/json')) {
      const responseText = await response.text();
      data = responseText ? JSON.parse(responseText) : null;
    } else {
      data = await response.text();
    }

    // Handle errors
    if (!response.ok) {
      const fromPayload =
        typeof data === 'object' && data !== null ? messageFromApiErrorPayload(data) : null;
      const errorMessage = fromPayload ?? `HTTP ${response.status}`;
      throw new Error(`API Error: ${errorMessage}`);
    }

    return data as T;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('API Error:')) {
      throw err;
    }
    if (err instanceof Error && err.message.includes('authentication token')) {
      throw err;
    }
    throw new Error(formatApiFailure(err, { url, method }));
  }
}

/**
 * Helper to create FormData for multipart requests
 * Useful for file uploads without Content-Type header
 */
export function createFormData(data: Record<string, string | File | Blob>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    formData.append(key, value);
  }
  return formData;
}

export { supabase };
