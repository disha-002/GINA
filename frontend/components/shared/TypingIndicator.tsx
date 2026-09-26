'use client';

import clsx from 'clsx';

interface TypingIndicatorProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function TypingIndicator({ size = 'md', className }: TypingIndicatorProps) {
  const dotSizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };

  return (
    <div className={clsx('flex items-center gap-1', className)}>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className={clsx(
            dotSizeClasses[size],
            'rounded-full bg-brand-cyan opacity-70',
            'animate-bounce'
          )}
          style={{
            animationDelay: `${index * 0.15}s`,
            animationDuration: '1.4s',
          }}
        />
      ))}
    </div>
  );
}
