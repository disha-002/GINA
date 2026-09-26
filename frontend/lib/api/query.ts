import { QueryPayload } from '@/types';
import { formatApiFailure, queryHttpError } from '@/lib/api/errors';

export interface SSEEvent {
  event: string;
  data: unknown;
}

/**
 * Async generator that streams query results via SSE (Server-Sent Events)
 * Uses fetch + ReadableStream since the backend POST /api/query is POST-only
 * (EventSource only supports GET)
 */
export async function* streamQuery(
  payload: QueryPayload,
  token: string
): AsyncGenerator<SSEEvent> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is required');
  }

  const url = `${base}/api/query`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(formatApiFailure(err, { url, method: 'POST' }));
  }

  if (!response.ok) {
    const bodyText = await response.text();
    throw queryHttpError(response.status, bodyText, url);
  }

  if (!response.body) {
    throw new Error('No response body from query stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Flush any remaining buffer
        if (buffer.trim()) {
          const event = parseSSEMessage(buffer);
          if (event) yield event;
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages
      const messages = buffer.split('\n\n');
      buffer = messages[messages.length - 1]; // Keep incomplete message in buffer

      for (let i = 0; i < messages.length - 1; i++) {
        const event = parseSSEMessage(messages[i]);
        if (event) yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a single SSE message block into event/data components
 * Format: "event: step\ndata: {...}\n"
 */
function parseSSEMessage(message: string): SSEEvent | null {
  const lines = message.trim().split('\n');
  let event = '';
  let data = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.substring('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      data = line.substring('data:'.length).trim();
    }
  }

  if (!event || !data) return null;

  try {
    return {
      event,
      data: JSON.parse(data),
    };
  } catch {
    // If data isn't JSON, return as string
    return {
      event,
      data,
    };
  }
}
