'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'talk-to-data-show-reasoning';

export function useReasoningToggle() {
  const [showReasoning, setShowReasoning] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === 'true') {
      setShowReasoning(true);
    }
    setMounted(true);
  }, []);

  const setReasoning = (value: boolean) => {
    setShowReasoning(value);
    sessionStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
  };

  // Persist to sessionStorage on change
  const toggleReasoning = () => {
    setShowReasoning((prev) => {
      const next = !prev;
      sessionStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
      return next;
    });
  };

  return {
    showReasoning,
    setReasoning,
    toggleReasoning,
    mounted,
  };
}
