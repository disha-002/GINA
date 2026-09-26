import type { Message, SessionContext } from '@/types';

const MAX_EXCHANGES = 3;

/**
 * Build backend-compatible sessionContext from loaded messages (before the new user message is appended).
 * Answers prefer stored narrative when assistant `content` is empty.
 */
export function buildSessionContextFromMessages(messages: Message[]): SessionContext {
  const pairs: Array<{ question: string; answer: string }> = [];

  for (let i = 0; i < messages.length - 1; i++) {
    const userMsg = messages[i];
    const asstMsg = messages[i + 1];
    if (userMsg?.role !== 'user' || asstMsg?.role !== 'assistant') continue;

    const answer =
      asstMsg.content?.trim() ||
      asstMsg.outputPayload?.narrative?.trim() ||
      '';

    pairs.push({
      question: userMsg.content,
      answer,
    });
  }

  return {
    recentExchanges: pairs.slice(-MAX_EXCHANGES),
  };
}
