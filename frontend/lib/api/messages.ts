import { apiFetch } from './client';
import type { Message } from '@/types';

/**
 * Messages API endpoints
 */

export async function getMessages(conversationId: string): Promise<Message[]> {
  const response = await apiFetch<{ messages: Message[] }>(
    `/api/conversations/${conversationId}/messages`
  );

  return response.messages;
}
