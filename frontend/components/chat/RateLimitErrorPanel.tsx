'use client';

import React, { useEffect, useState } from 'react';

interface RateLimitErrorPanelProps {
  retryAfterSeconds?: number;
  onRetry?: () => void;
}

export function RateLimitErrorPanel({
  retryAfterSeconds,
  onRetry,
}: RateLimitErrorPanelProps) {
  const [countdown, setCountdown] = useState<number>(retryAfterSeconds || 0);

  useEffect(() => {
    setCountdown(retryAfterSeconds || 0);
  }, [retryAfterSeconds]);

  useEffect(() => {
    if (countdown <= 0) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [countdown]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  return (
    <div
      className="flex items-start gap-4 rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-4"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div className="shrink-0 flex items-center justify-center w-8 h-8">
        <svg
          className="w-6 h-6 text-amber-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <div className="flex-1">
        <h3 className="mb-1 font-semibold text-amber-100">Rate Limit Reached</h3>
        <p className="mb-3 text-sm text-amber-200/90">
          You&apos;ve used your daily token limit for the API. To continue asking questions, please wait
          or upgrade your account.
        </p>

        <div className="space-y-2">
          {countdown > 0 && (
            <div className="inline-flex items-center gap-2 rounded-md bg-amber-600/20 px-3 py-1.5">
              <span className="text-xs font-normal text-amber-100">Retry available in:</span>
              <span className="font-mono text-sm font-semibold text-amber-300">
                {formatTime(countdown)}
              </span>
            </div>
          )}

          {countdown === 0 && retryAfterSeconds && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-md bg-brand-indigo px-4 py-2 text-sm font-normal text-white transition-colors hover:bg-brand-indigo-light"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
