import { apiFetch } from './client';
import type { Conversation } from '@/types';

/**
 * Conversations API endpoints
 */

export async function listConversations(datasetId: string): Promise<Conversation[]> {
  const response = await apiFetch<{ conversations: Conversation[] }>(
    `/api/datasets/${datasetId}/conversations`
  );
  return response.conversations;
}

export async function createConversation(
  datasetId: string,
  title?: string
): Promise<Conversation> {
  const response = await apiFetch<Conversation>(`/api/datasets/${datasetId}/conversations`, {
    method: 'POST',
    body: JSON.stringify({ title: title || null }),
  });

  return response;
}

export async function updateConversation(
  conversationId: string,
  body: { title: string }
): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/conversations/${conversationId}`, {
    method: 'DELETE',
  });
}
