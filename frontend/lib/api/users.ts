import { apiFetch } from '@/lib/api/client';

export interface UserSyncResponse {
  ok: boolean;
  user: { id: string; email: string };
}

/** POST /api/users/sync — ensures `users` row exists for the JWT subject. */
export async function syncUserProfile(): Promise<UserSyncResponse> {
  return apiFetch<UserSyncResponse>('/api/users/sync', {
    method: 'POST',
    body: '{}',
  });
}
