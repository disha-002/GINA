/**
 * User-facing messages for failed API calls (connectivity, auth, HTTP errors).
 */
export function formatApiFailure(
  err: unknown,
  context: { url: string; method?: string }
): string {
  if (err instanceof TypeError && err.message === 'Failed to fetch') {
    return (
      `Cannot reach the API (${context.method ?? 'GET'} ${context.url}). ` +
      'Check that the backend is running and NEXT_PUBLIC_API_BASE_URL matches it (no trailing slash). ' +
      'If the app is on another host (e.g. Vercel), set backend CORS_ORIGINS to your exact frontend origin ' +
      '(e.g. https://your-app.vercel.app) — localhost is allowed by default, production URLs are not.'
    );
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Request failed';
}

/**
 * Turn backend JSON `{ error, details? }` (e.g. Zod flatten) into one line — shared by REST and query pre-stream errors.
 */
export function messageFromApiErrorPayload(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('error' in data)) {
    return null;
  }
  const errorField = (data as { error: unknown }).error;
  let errorMessage: string;

  if (typeof errorField === 'string') {
    errorMessage = errorField;
  } else if (typeof errorField === 'object' && errorField !== null && 'message' in errorField) {
    errorMessage = String((errorField as { message: unknown }).message);
  } else {
    errorMessage = String(errorField);
  }

  const details = (data as { details?: { fieldErrors?: Record<string, string[]> } }).details;
  if (details?.fieldErrors) {
    const first = Object.values(details.fieldErrors).flat()[0];
    if (first) errorMessage = `${errorMessage}: ${first}`;
  }
  return errorMessage;
}

/** Detect if error is a rate limit error */
export function isRateLimitError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();

  const normalized = message.toLowerCase();
  return (
    normalized.includes('rate_limit') ||
    normalized.includes('rate limit') ||
    normalized.includes('rate_limit_exceeded') ||
    normalized.includes('tokens per day') ||
    normalized.includes('tpd')
  );
}

/** Extract rate limit info (retry time, upgrade link) from error message */
export function parseRateLimitError(err: unknown): {
  message: string;
  retryAfterSeconds?: number;
  upgradeUrl?: string;
} | null {
  const errStr =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();

  // Check if this is a rate limit error
  if (!isRateLimitError(errStr)) return null;

  // Try to extract retry time (e.g., "Please try again in 9m2.592s")
  let retryAfterSeconds: number | undefined;
  const minuteSecondMatch = errStr.match(/(\d+)\s*m(?:in(?:ute)?s?)?\s*(\d+(?:\.\d+)?)\s*s/i);
  if (minuteSecondMatch) {
    const minutes = parseInt(minuteSecondMatch[1], 10);
    const seconds = parseFloat(minuteSecondMatch[2]);
    retryAfterSeconds = minutes * 60 + Math.ceil(seconds);
  } else {
    const secondsOnlyMatch = errStr.match(
      /(?:try again in|retry after)\s*(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?/i
    );
    if (secondsOnlyMatch) {
      retryAfterSeconds = Math.ceil(parseFloat(secondsOnlyMatch[1]));
    }
  }

  // Extract upgrade URL if present
  let upgradeUrl: string | undefined;
  const urlMatch = errStr.match(/https?:\/\/[^\s"']+/);
  if (urlMatch) {
    upgradeUrl = urlMatch[0];
  }

  return {
    message: errStr,
    retryAfterSeconds,
    upgradeUrl,
  };
}

/** Build a clear Error for failed `POST /api/query` before the SSE body starts. */
export function queryHttpError(status: number, bodyText: string, url: string): Error {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    parsed = null;
  }
  const fromJson = parsed !== null ? messageFromApiErrorPayload(parsed) : null;
  if (fromJson) {
    return new Error(`Query failed (${status}): ${fromJson}`);
  }
  const trimmed = bodyText.trim().slice(0, 400);
  if (trimmed) {
    return new Error(`Query failed (${status}): ${trimmed}`);
  }
  return new Error(`Query failed (${status}). ${url}`);
}
