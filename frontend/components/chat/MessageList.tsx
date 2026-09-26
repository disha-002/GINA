'use client';

import { useEffect, useRef } from 'react';
import { ReactNode } from 'react';

export interface MessageListProps {
  children: ReactNode;
}

export function MessageList({ children }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on children change
  useEffect(() => {
    if (containerRef.current) {
      const { scrollHeight, clientHeight } = containerRef.current;
      containerRef.current.scrollTop = scrollHeight - clientHeight;
    }
  }, [children]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-6 py-6 space-y-4"
    >
      {children}
    </div>
  );
}
