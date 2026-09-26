'use client';

import { useEffect } from 'react';

interface KeyboardShortcuts {
  'Ctrl+K'?: () => void;
  'Cmd+K'?: () => void;
  'Ctrl+Enter'?: () => void;
  'Cmd+Enter'?: () => void;
  'Escape'?: () => void;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

      // Cmd/Ctrl+Enter works while focused in chat inputs (submit)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const key = isMac ? 'Cmd+Enter' : 'Ctrl+Enter';
        const handler = shortcuts[key as keyof KeyboardShortcuts];
        if (handler) {
          e.preventDefault();
          handler();
        }
        return;
      }

      // Other shortcuts: skip when typing in inputs (except where handled above)
      if (isInputField) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const key = isMac ? 'Cmd+K' : 'Ctrl+K';
        shortcuts[key as keyof KeyboardShortcuts]?.();
      }

      if (e.key === 'Escape') {
        shortcuts['Escape']?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
