'use client';

import Link from 'next/link';
import { useState } from 'react';
import AuthModal from '@/components/landing/AuthModal';
import {
  Upload,
  ShieldCheck,
  Brain,
  BarChart3,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Play,
} from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: Upload,
    title: 'Upload Your CSV',
    subtitle: 'Drop any structured data file',
    description:
      'Simply drag & drop or browse to upload any CSV file — sales data, survey results, financial reports, inventory logs. No database setup, no technical knowledge needed.',
    highlights: ['Supports up to 50MB files', 'Any CSV structure accepted', 'Instant schema detection'],
    color: 'from-brand-indigo to-brand-purple',
    glow: 'rgba(90,78,227,0.25)',
  },
  {
    number: '02',
    icon: ShieldCheck,
    title: 'Auto PII Redaction',
    subtitle: 'Privacy-first by design',
    description:
      'When you upload a file, G.I.N.A scans it on the server and redacts personally identifiable information — names, emails, phone numbers, SSNs — before storage and analysis, so sensitive values are not kept at rest in raw form.',
    highlights: ['Names & emails redacted', 'GDPR & CCPA aligned', 'Redacted data for AI & SQL'],
    color: 'from-emerald-500 to-teal-500',
    glow: 'rgba(16,185,129,0.25)',
  },
  {
    number: '03',
    icon: Brain,
    title: 'Ask in Plain English',
    subtitle: 'Just type your question',
    description:
      'Type any question about your data in natural language. G.I.N.A translates it into precise SQL, executes it against your dataset, and returns a clear, human-readable answer.',
    highlights: ['Natural language → SQL', 'Real SQL execution', 'Instant grounded answers'],
    color: 'from-brand-indigo-light to-brand-cyan',
    glow: 'rgba(114,103,242,0.25)',
  },
  {
    number: '04',
    icon: BarChart3,
    title: 'Explore Insights',
    subtitle: 'Visualize & dive deeper',
    description:
      'Results come with auto-generated charts, summary statistics, and suggested follow-up questions. Pin key insights to your dashboard and share them with your team.',
    highlights: ['Auto-generated charts', 'Suggested follow-ups', 'Shareable dashboards'],
    color: 'from-brand-cyan to-sky-400',
    glow: 'rgba(60,224,214,0.25)',
  },
];



export default function HowItWorksPage() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div className="min-h-screen bg-surface flex flex-col font-sans text-slate-200 selection:bg-brand-indigo/30">
      {/* Header */}
      <header className="w-full border-b border-white/5 py-4 px-8 flex items-center justify-between z-20 sticky top-0 bg-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">
            G.I.N.A
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium tracking-wide text-slate-300">
            <Link href="#steps" className="hover:text-white transition-colors border-b border-white/30 pb-0.5">
              HOW IT WORKS
            </Link>
            <Link href="/" className="hover:text-white transition-colors">
              HOME
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-6">
          <button
            onClick={() => setShowAuth(true)}
            className="text-sm font-semibold tracking-wide text-slate-300 hover:text-white transition-colors uppercase"
          >
            LOG IN
          </button>
          <button
            onClick={() => setShowAuth(true)}
            className="text-sm font-semibold tracking-wide text-white border border-white/20 rounded-lg px-5 py-2.5 hover:bg-white/5 transition-colors"
          >
            Get started
          </button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden px-6 pt-24 pb-20 text-center">
          {/* Dot grid background */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.12]"
            style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          {/* Glow orbs */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-brand-indigo/10 rounded-full blur-[120px] pointer-events-none" />

          <div className="relative z-10 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-indigo/10 border border-brand-indigo/30 px-4 py-1.5 mb-8">
              <Sparkles className="w-3.5 h-3.5 text-brand-indigo-light" />
              <span className="text-xs font-bold tracking-widest text-brand-indigo-light uppercase">
                How G.I.N.A works
              </span>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-6">
              From raw data to{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-indigo-light to-brand-cyan">
                clear answers
              </span>
              <br />
              in 4 simple steps
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-10">
              No SQL. No dashboards. No guesswork. Just upload your data, ask a question, and get instant grounded insights powered by real query execution.
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setShowAuth(true)}
                className="bg-white text-slate-900 px-8 py-3.5 rounded-lg text-base font-semibold hover:bg-slate-100 transition-colors"
              >
                Try it free
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

        {/* Steps Section */}
        <section className="px-6 py-20 max-w-6xl mx-auto" id="steps">
          <div className="space-y-8">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isEven = index % 2 === 0;
              return (
                <div
                  key={step.number}
                  className={`relative flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-10 rounded-2xl border border-surface-border bg-surface-secondary p-8 md:p-12 overflow-hidden group hover:border-white/10 transition-all duration-300`}
                  style={{ boxShadow: `0 0 60px ${step.glow}` }}
                >
                  {/* Background number */}
                  <div
                    className="absolute top-4 right-6 text-[8rem] font-black leading-none select-none pointer-events-none opacity-[0.04] text-white"
                  >
                    {step.number}
                  </div>

                  {/* Icon side */}
                  <div className="flex-shrink-0 flex flex-col items-center md:items-start gap-4 w-full md:w-64">
                    <div
                      className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} shadow-lg mb-2`}
                    >
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <span className="text-xs font-black tracking-[0.2em] text-slate-500 uppercase">Step {step.number}</span>
                    <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">{step.title}</h2>
                    <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest">{step.subtitle}</p>
                    <ul className="space-y-2 mt-4">
                      {step.highlights.map((h) => (
                        <li key={h} className="flex items-center gap-2 text-sm text-slate-300">
                          <CheckCircle2 className="w-4 h-4 text-brand-indigo-light flex-shrink-0" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Description side */}
                  <div className="flex-1">
                    <p className="text-lg text-slate-300 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>


        {/* CTA Section */}
        <section className="px-6 py-24 border-t border-surface-border relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-indigo/5 to-transparent pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-brand-indigo/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="relative z-10 max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-indigo mb-8 shadow-[0_0_30px_rgba(90,78,227,0.4)]">
              <Sparkles className="w-8 h-8 text-white fill-white" />
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to talk to your data?
            </h2>
            <p className="text-xl text-slate-400 mb-10 max-w-xl mx-auto leading-relaxed">
              Join thousands of users already getting instant insights from their CSV files — no SQL, no setup.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => setShowAuth(true)}
                className="bg-white text-slate-900 px-10 py-4 rounded-lg text-base font-bold hover:bg-slate-100 transition-colors w-full sm:w-auto"
              >
                Get started for free
              </button>
              <Link
                href="/"
                className="flex items-center gap-2 text-slate-300 hover:text-white border border-surface-border px-10 py-4 rounded-lg text-base font-medium transition-colors w-full sm:w-auto justify-center hover:border-white/20"
              >
                <Play className="w-4 h-4 fill-current" />
                Back to home
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-500">Instant setup</p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-border bg-[#0A0D14] py-10 px-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Link href="/" className="text-lg font-bold text-white">G.I.N.A</Link>
          <p className="text-xs text-slate-500">© 2026 G.I.N.A Intelligence. All rights reserved.</p>
          <div className="flex items-center gap-6 text-xs text-slate-400">
            <Link href="/#" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/#" className="hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
