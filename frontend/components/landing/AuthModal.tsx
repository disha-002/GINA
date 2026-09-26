'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getOAuthCallbackUrl } from '@/lib/siteUrl';
import { Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getOAuthCallbackUrl(),
      },
    });
    if (error) {
      setError(error.message);
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      className="max-w-md p-10 flex flex-col items-center text-center bg-surface-secondary shadow-2xl"
    >
      <div className="flex flex-col w-full h-full">

        <div className="mb-6 flex flex-col items-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-indigo mb-6 shadow-[0_0_20px_rgba(90,78,227,0.4)]">
            <Sparkles className="w-7 h-7 text-white fill-white" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-white mb-1">G.I.N.A</h2>
          <p className="text-xl font-bold text-slate-200">Sign in to G.I.N.A</p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 w-full px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="w-full flex-col flex gap-3">
          <Button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-60 h-[52px]"
          >
            {isLoading ? (
              <svg className="w-5 h-5 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            {isLoading ? 'Wait...' : 'Continue with Google'}
          </Button>
        </div>

        <p className="mt-8 text-center text-xs text-slate-500 leading-relaxed max-w-[280px] self-center">
          By signing in, you agree to our Terms of Service. G.I.N.A automatically redacts PII before processing queries to ensure data privacy and security.
        </p>
      </div>
    </Modal>
  );
}
