'use client';

import Link from 'next/link';
import { useState } from 'react';
import AuthModal from '@/components/landing/AuthModal';
import {
  Zap,
  Lock,
  MessageSquare,
  FileText,
  BarChart3,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Answers in under 3 seconds. Real SQL execution on your actual data — not approximations.',
    stat: '< 3s',
    statLabel: 'avg response',
    color: 'from-amber-500 to-orange-500',
    glow: 'rgba(245,158,11,0.15)',
  },
  {
    icon: Lock,
    title: 'Privacy First',
    description: 'PII redaction happens client-side before any data is transmitted. Your sensitive data stays local.',
    stat: '0 PII',
    statLabel: 'ever transmitted',
    color: 'from-emerald-500 to-teal-500',
    glow: 'rgba(16,185,129,0.15)',
  },
  {
    icon: MessageSquare,
    title: 'Conversational',
    description: 'Ask follow-up questions in a chat-like interface. G.I.N.A remembers context across your session.',
    stat: '∞',
    statLabel: 'follow-ups',
    color: 'from-sky-500 to-blue-500',
    glow: 'rgba(14,165,233,0.15)',
  },
  {
    icon: FileText,
    title: 'No SQL Required',
    description: 'Turn plain English into production-grade SQL queries instantly. No technical expertise needed.',
    stat: '100%',
    statLabel: 'plain English',
    color: 'from-brand-indigo to-brand-purple',
    glow: 'rgba(90,78,227,0.15)',
  },
  {
    icon: BarChart3,
    title: 'Auto Visualization',
    description: 'Charts and graphs are automatically generated based on the type of data in your answer.',
    stat: '12+',
    statLabel: 'chart types',
    color: 'from-brand-indigo-light to-brand-cyan',
    glow: 'rgba(114,103,242,0.15)',
  },
  {
    icon: ShieldCheck,
    title: 'Grounded Answers',
    description: 'Every answer references real rows in your file. No hallucinations — only facts from your data.',
    stat: '99.8%',
    statLabel: 'accuracy',
    color: 'from-rose-500 to-pink-500',
    glow: 'rgba(244,63,94,0.15)',
  },
];

const useCases = [
  { role: 'Sales Teams', example: '"What was our best-performing region last quarter?"' },
  { role: 'Finance', example: '"Show me month-over-month revenue growth."' },
  { role: 'HR & People', example: '"Which department has the highest attrition rate?"' },
  { role: 'Product', example: '"What features are users engaging with most?"' },
  { role: 'Operations', example: '"Where are we seeing the most delays in fulfillment?"' },
  { role: 'Executives', example: '"Give me a summary of KPIs across all divisions."' },
];

export default function WhatGinaProvides() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div className="min-h-screen bg-surface flex flex-col font-sans text-slate-200 selection:bg-brand-indigo/30">
      {/* Header */}
      <header className="w-full border-b border-white/5 py-4 px-8 flex items-center justify-between z-20 sticky top-0 bg-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">
            G.I.N.A
          </Link>
        </div>
        <div className="flex items-center gap-6">
          <Link
            href="/what-gina-provides"
            className="text-sm font-semibold tracking-wide text-brand-indigo-light border-b border-brand-indigo-light/40 pb-0.5"
          >
            What G.I.N.A Provides
          </Link>
          <button
            onClick={() => setShowAuth(true)}
            className="text-sm font-semibold tracking-wide text-slate-300 hover:text-white transition-colors uppercase"
          >
            LOG IN
          </button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center">
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.08]"
            style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-brand-indigo/10 rounded-full blur-[130px] pointer-events-none" />

          <div className="relative z-10 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-indigo/10 border border-brand-indigo/30 px-4 py-1.5 mb-8">
              <Sparkles className="w-3.5 h-3.5 text-brand-indigo-light" />
              <span className="text-xs font-bold tracking-widest text-brand-indigo-light uppercase">What G.I.N.A provides</span>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-4">
              Data that talks.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-indigo-light to-brand-cyan">
                Insights that land.
              </span>
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-10">
              Built for analysts, business owners, and anyone who needs answers from data — without writing a single line of SQL.
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setShowAuth(true)}
                className="bg-white text-slate-900 px-8 py-3.5 rounded-lg text-base font-semibold hover:bg-slate-100 transition-colors"
              >
                Get started free
              </button>
              <Link
                href="/"
                className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors text-sm font-medium"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
                Back to home
              </Link>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="px-6 py-16 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="group rounded-2xl border border-surface-border bg-surface-secondary p-7 hover:border-white/10 transition-all duration-300 relative overflow-hidden"
                  style={{ boxShadow: `0 0 40px ${feat.glow}` }}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />

                  {/* Top row: icon + stat */}
                  <div className="flex items-start justify-between mb-5">
                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${feat.color} shadow-lg`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-white">{feat.stat}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest">{feat.statLabel}</p>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2">{feat.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{feat.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Use Cases Section */}
        <section className="px-6 py-16 border-t border-surface-border">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs font-bold tracking-widest text-brand-indigo-light uppercase mb-3">Built for everyone</p>
              <h2 className="text-4xl font-bold text-white mb-4">Who uses G.I.N.A?</h2>
              <p className="text-slate-400 text-lg max-w-xl mx-auto">
                Anyone who has data and questions. No SQL background required.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {useCases.map((uc) => (
                <div
                  key={uc.role}
                  className="flex items-start gap-4 rounded-xl border border-surface-border bg-surface-secondary p-5 hover:border-white/10 transition-colors group"
                >
                  <CheckCircle2 className="w-5 h-5 text-brand-indigo-light flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <div>
                    <p className="text-sm font-bold text-white mb-1">{uc.role}</p>
                    <p className="text-sm text-slate-400 italic">{uc.example}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 py-24 border-t border-surface-border relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-indigo/5 to-transparent pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-brand-indigo/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="relative z-10 max-w-2xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-indigo mb-8 shadow-[0_0_30px_rgba(90,78,227,0.4)]">
              <Sparkles className="w-7 h-7 text-white fill-white" />
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-5">
              Ready to ask your data anything?
            </h2>
            <p className="text-xl text-slate-400 mb-10 max-w-md mx-auto leading-relaxed">
              Upload a CSV and get grounded answers in seconds.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => setShowAuth(true)}
                className="bg-white text-slate-900 px-10 py-4 rounded-lg text-base font-bold hover:bg-slate-100 transition-colors w-full sm:w-auto"
              >
                Get started for free
              </button>
              <Link
                href="/how-it-works"
                className="flex items-center gap-2 text-slate-300 hover:text-white border border-surface-border px-8 py-4 rounded-lg text-sm font-medium transition-colors hover:border-white/20"
              >
                How it works
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <p className="mt-5 text-xs text-slate-500">Instant setup</p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-border bg-[#0A0D14] py-8 px-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Link href="/" className="text-lg font-bold text-white">G.I.N.A</Link>
          <p className="text-xs text-slate-500">© 2026 G.I.N.A Intelligence. All rights reserved.</p>
          <Link href="/how-it-works" className="text-xs text-slate-400 hover:text-white transition-colors">How it works</Link>
        </div>
      </footer>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
