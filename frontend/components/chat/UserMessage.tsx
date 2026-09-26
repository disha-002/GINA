'use client';

export interface UserMessageProps {
  text: string;
}

export function UserMessage({ text }: UserMessageProps) {
  return (
    <div className="flex justify-end mb-6">
      <div
        className="max-w-xs lg:max-w-[600px] px-5 py-3.5 text-slate-100 text-sm font-normal leading-relaxed rounded-2xl rounded-br-sm"
        style={{
          fontFamily: 'Inter, sans-serif',
          background: 'linear-gradient(135deg, rgba(90,78,227,0.22), rgba(114,103,242,0.14))',
          border: '1px solid rgba(90,78,227,0.30)',
          boxShadow: '0 2px 12px rgba(90,78,227,0.12)',
        }}
      >
        {text}
      </div>
    </div>
  );
}
