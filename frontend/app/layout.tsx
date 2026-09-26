import type { Metadata } from 'next';
import { Inter, Playfair_Display, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { UIStateProvider } from '@/lib/providers/UIStateProvider';
import { ToastProvider } from '@/lib/providers/ToastProvider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'G.I.N.A — Grounded Insight from Natural Language Analytics',
  description:
    'Ask your data anything. Upload a CSV — get plain English answers instantly. No SQL, no dashboards, no guesswork.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} ${mono.variable}`}>
      <body className="antialiased font-sans text-slate-200 bg-slate-950 selection:bg-indigo-500/30">
        <ToastProvider>
          <UIStateProvider>
            {children}
          </UIStateProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
