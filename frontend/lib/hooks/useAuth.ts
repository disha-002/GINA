'use client';

import { useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { syncUserProfile } from '@/lib/api/users';

interface UseAuthReturn {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  // Fire-and-forget user sync to backend (same path as E2E POST /api/users/sync)
  const syncUser = useCallback(async () => {
    try {
      await syncUserProfile();
    } catch {
      // Non-critical — don't block UI on sync failure
    }
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.access_token) {
        void syncUser();
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      // Sync user to backend on sign-in
      if (session?.access_token) {
        void syncUser();
      }
    });

    return () => subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUser]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  return { user, session, isLoading, signOut };
}
