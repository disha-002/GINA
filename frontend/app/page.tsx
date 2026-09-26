'use client';

import { useState } from 'react';
import Link from 'next/link';
import AuthModal from '@/components/landing/AuthModal';
import { Play } from 'lucide-react';

export default function LandingPage() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div className="min-h-screen bg-surface flex flex-col font-sans selection:bg-brand-indigo/30 text-slate-200">
      {/* Top Marquee */}
      <div className="w-full bg-brand-indigo text-xs font-semibold tracking-widest uppercase py-2.5 overflow-hidden whitespace-nowrap border-b border-brand-indigo-light/20 flex flex-row items-center text-white/90">
        <div className="animate-marquee inline-flex gap-8 px-4">
          <span>GET INSTANT INSIGHTS →</span>
          <span>POWERED BY REAL SQL EXECUTION →</span>
          <span>PII AUTOMATICALLY REDACTED BEFORE UPLOAD →</span>
          <span>ASK YOUR DATA ANYTHING IN PLAIN ENGLISH →</span>
          <span>NO SQL →</span>
          <span>GET INSTANT INSIGHTS →</span>
          <span>POWERED BY REAL SQL EXECUTION →</span>
          <span>PII AUTOMATICALLY REDACTED BEFORE UPLOAD →</span>
          <span>ASK YOUR DATA ANYTHING IN PLAIN ENGLISH →</span>
          <span>NO SQL →</span>
        </div>
      </div>

      {/* Header */}
      <header className="w-full border-b border-white/5 py-4 px-8 flex items-center justify-between z-20 sticky top-0 bg-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">
            G.I.N.A
          </Link>
        </div>
        <div className="flex items-center gap-10">
          <Link
            href="/what-gina-provides"
            className="text-sm font-medium tracking-wide text-slate-300 hover:text-white transition-colors"
          >
            Why G.I.N.A
          </Link>
          <button
            onClick={() => setShowAuth(true)}
            className="text-sm font-semibold tracking-wide text-slate-200 border border-white/20 rounded-lg px-5 py-2 hover:bg-white/5 hover:border-white/40 transition-colors uppercase"
          >
            LOG IN
          </button>
        </div>
      </header>

      {/* Main Hero */}
      <main className="relative flex-1 flex flex-col items-center justify-center overflow-hidden px-4 pt-20 pb-32">
        {/* Dot pattern background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.15]"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto mt-10">
          {/* Badge */}
          <div className="inline-flex items-center justify-center rounded-full bg-brand-indigo px-4 py-1.5 mb-8 text-xs font-bold tracking-widest text-white uppercase shadow-[0_0_15px_rgba(90,78,227,0.5)]">
            G.I.N.A
          </div>

          {/* Heading */}
          <h1 className="flex flex-col items-center gap-2 mb-6">
            <span className="font-serif text-5xl md:text-6xl lg:text-7xl italic text-slate-200 font-light">
              Grounded Insight from
            </span>
            <span className="text-6xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight text-white leading-none">
              Natural Language<br />Analytics
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed mb-10 font-medium">
            Ask your data anything. Upload a CSV — get plain English answers instantly.<br />
            No SQL, no dashboards, no guesswork.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <button
              onClick={() => setShowAuth(true)}
              className="bg-white text-slate-900 px-8 py-3.5 rounded-lg text-base font-semibold hover:bg-slate-100 transition-colors w-full sm:w-auto"
            >
              Get started for free
            </button>
            <Link
              href="/how-it-works"
              className="bg-surface-secondary border border-surface-border text-white px-8 py-3.5 rounded-lg text-base font-semibold hover:bg-surface-tertiary transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <div className="bg-brand-indigo/20 text-brand-indigo-light p-1 rounded-full">
                <Play className="w-4 h-4 fill-current" />
              </div>
              See how it works
            </Link>
          </div>

          <p className="text-sm text-slate-400">
            Sign in with Google
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-border bg-[#0A0D14] py-8 px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo + tagline */}
          <div className="flex flex-col items-center md:items-start gap-1">
            <span className="text-lg font-bold tracking-tight text-white">G.I.N.A</span>
            <span className="text-xs text-slate-500">The intelligence layer for your structured data.</span>
          </div>

          {/* Real links */}
          <div className="flex items-center gap-8 text-sm text-slate-400">
            <Link href="/how-it-works" className="hover:text-white transition-colors">How it works</Link>
          </div>

          {/* Copyright */}
          <p className="text-xs text-slate-500">© 2026 G.I.N.A Intelligence.</p>
        </div>
      </footer>

      {/* Auth Modal */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
