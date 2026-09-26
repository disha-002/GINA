/**
 * Serial Groq queue + rate-aware delay from response headers (Backend_Master §7.2).
 * Reads `x-ratelimit-remaining-requests`; if remaining < 3, waits until reset.
 */

let chain: Promise<unknown> = Promise.resolve();
let nextAllowedAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse Groq reset header: Unix seconds, ms, or seconds-until-reset. */
function delayMsFromResetHeader(resetRaw: string | null, remaining: number): number {
  if (!resetRaw) return remaining < 3 ? 2000 : 0;
  const n = Number(resetRaw);
  if (Number.isNaN(n) || n <= 0) return 2000;

  const now = Date.now();
  // 13-digit → already ms timestamp
  if (n > 1e12) return Math.max(0, n - now);
  // 10-digit → Unix seconds
  if (n > 1e9) return Math.max(0, n * 1000 - now);
  // small number → treat as seconds from now
  return n * 1000;
}

export function recordGroqRateLimits(headers: Headers): void {
  const remainingRaw = headers.get('x-ratelimit-remaining-requests');
  const resetRaw =
    headers.get('x-ratelimit-reset-requests') ?? headers.get('x-ratelimit-reset-tokens');

  const remaining = remainingRaw != null ? parseInt(remainingRaw, 10) : NaN;
  if (Number.isNaN(remaining)) return;

  if (remaining < 3) {
    const wait = delayMsFromResetHeader(resetRaw, remaining);
    nextAllowedAt = Math.max(nextAllowedAt, Date.now() + wait);
  }
}

async function waitForSlot(): Promise<void> {
  const wait = Math.max(0, nextAllowedAt - Date.now());
  if (wait > 0) {
    await sleep(wait);
  }
}

/**
 * Run one Groq request at a time; after each response, update delay from rate-limit headers.
 * Pass the result of `groq.chat.completions.create(...).withResponse()`.
 */
export async function runGroqQueued<T>(fn: () => Promise<{ data: T; response: Response }>): Promise<T> {
  const run = chain.then(async () => {
    await waitForSlot();
    const { data, response } = await fn();
    recordGroqRateLimits(response.headers);
    return data;
  });

  chain = run.then(
    () => {},
    () => {},
  );

  return run as Promise<T>;
}
