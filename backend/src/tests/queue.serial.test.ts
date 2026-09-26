import assert from 'node:assert';
import { test } from 'node:test';
import { runGroqQueued } from '../ratelimit/queue.js';

test('runGroqQueued runs work serially (no overlapping execution)', async () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  const n = 12;

  await Promise.all(
    Array.from({ length: n }, (_, i) =>
      runGroqQueued(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 5));
        concurrent -= 1;
        return {
          data: i,
          response: new Response(null, {
            headers: new Headers({ 'x-ratelimit-remaining-requests': '99' }),
          }),
        };
      }),
    ),
  );

  assert.equal(maxConcurrent, 1, 'Groq queue must not run two handlers at once');
});
