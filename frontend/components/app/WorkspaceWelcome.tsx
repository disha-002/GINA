'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Dataset } from '@/types';
import { useDatasets } from '@/lib/hooks/useDatasets';
import { useUploadModal } from '@/lib/hooks/useUploadModal';
import { listConversations, createConversation } from '@/lib/api/conversations';
import {
  Database,
  MessageSquare,
  Sparkles,
  UploadCloud,
  ChevronRight,
  Loader2,
} from 'lucide-react';

export default function WorkspaceWelcome() {
  const router = useRouter();
  const { datasets, setActiveDataset } = useDatasets();
  const { openUploadModal } = useUploadModal();
  const [openingId, setOpeningId] = useState<string | null>(null);

  const openDataset = async (d: Dataset) => {
    setOpeningId(d.id);
    try {
      setActiveDataset(d);
      const convs = await listConversations(d.id);
      if (convs.length > 0) {
        router.push(`/app/${convs[0].id}`);
        return;
      }
      const conv = await createConversation(d.id);
      router.push(`/app/${conv.id}`);
    } finally {
      setOpeningId(null);
    }
  };

  // Visual Onboarding Component with auto-advance every second
  const [currentStep, setCurrentStep] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const fullText = 'Show me monthly revenue trends';
  
  const STEP_DURATION = 3000; // 3 seconds per step
  const TEXT_SPEED = 25; // ms per character - faster for smoother typing

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % 3);
      setDisplayedText('');
    }, STEP_DURATION);

    return () => clearInterval(stepInterval);
  }, []);

  useEffect(() => {
    if (currentStep === 1 && displayedText.length < fullText.length) {
      const timer = setTimeout(() => {
        setDisplayedText(fullText.slice(0, displayedText.length + 1));
      }, TEXT_SPEED);
      return () => clearTimeout(timer);
    }
  }, [currentStep, displayedText]);

  return (
    <div 
      className="flex flex-1 flex-col overflow-y-auto animate-fade-in relative"
      style={{
        background: `
          radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 1px),
          #0a0d14
        `,
        backgroundSize: '32px 32px',
        backgroundAttachment: 'fixed',
      }}
    >
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 1; }
          50% { transform: translateY(-10px); opacity: 1; }
        }
        @keyframes fadeInScale {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-6xl xl:max-w-7xl px-6 py-12 md:py-16 relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-12 lg:gap-10 xl:gap-14">
          {/* Left: headline + primary CTA */}
          <div className="flex-1 min-w-0 max-w-2xl">
            <div className="mb-0">
              <div
                className="mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest"
                style={{
                  background: 'rgba(90,78,227,0.12)',
                  border: '1px solid rgba(90,78,227,0.3)',
                  color: '#7267F2',
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Workspace
              </div>

              <h1 className="mt-6 flex flex-col gap-2">
                <span className="font-serif text-5xl md:text-6xl font-light text-slate-200 tracking-tight">
                  Welcome to
                </span>
                <span className="text-6xl md:text-7xl font-bold tracking-tight text-white leading-none">
                  G.I.N.A
                </span>
              </h1>
              <p className="mt-6 text-lg md:text-xl leading-relaxed text-slate-300 font-medium">
                Upload a CSV and start asking questions in plain English. Get instant, AI-powered insights without writing a single line of SQL.
              </p>
            </div>

            <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-4">
              <button
                type="button"
                onClick={openUploadModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3.5 text-base font-semibold text-white transition-all duration-200 hover:shadow-lg w-full sm:w-auto"
                style={{
                  background: 'linear-gradient(135deg, #5A4EE3, #3CE0D6)',
                  boxShadow: '0 4px 24px rgba(90,78,227,0.25)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 32px rgba(90,78,227,0.4)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 24px rgba(90,78,227,0.25)';
                }}
              >
                <UploadCloud className="h-5 w-5" />
                Upload a CSV
              </button>
              <p className="text-sm text-slate-400 flex items-center">
                Free to start
              </p>
            </div>
          </div>

          {/* Right: vertical “how it works” card (aligned with hero row) */}
          <div className="w-full max-w-md mx-auto lg:mx-0 lg:max-w-[380px] xl:max-w-[420px] shrink-0 lg:sticky lg:top-24">
            <p className="mb-3 text-center lg:text-left text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
              How it works
            </p>
            <div
              className="rounded-2xl px-5 py-6 md:px-6 md:py-7 relative overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
            <div className="flex flex-col gap-0 relative z-10">
              {/* Step 1: Upload */}
              <div
                className="w-full flex items-center gap-4 p-4 rounded-xl cursor-default group"
                style={{
                  background: currentStep === 0 
                    ? 'linear-gradient(135deg, rgba(60,224,214,0.15) 0%, rgba(60,224,214,0.05) 100%)'
                    : 'transparent',
                  border: currentStep === 0 
                    ? '1px solid rgba(60,224,214,0.3)' 
                    : '1px solid rgba(255,255,255,0.05)',
                  transition: 'all 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                }}
                onMouseEnter={() => setHoveredStep(0)}
                onMouseLeave={() => setHoveredStep(null)}
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                    currentStep === 0 || hoveredStep === 0 ? 'scale-110' : 'scale-100'
                  }`}
                  style={{
                    background: currentStep === 0 
                      ? 'rgba(60,224,214,0.2)' 
                      : hoveredStep === 0 ? 'rgba(60,224,214,0.15)' : 'rgba(255,255,255,0.05)',
                    border: currentStep === 0 
                      ? '1.5px solid rgba(60,224,214,0.5)' 
                      : '1px solid rgba(255,255,255,0.1)',
                    transition: 'all 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                  }}
                >
                  <UploadCloud
                    className={`h-6 w-6 ${
                      currentStep === 0 ? 'text-teal-300' : 'text-slate-500'
                    }`}
                    style={{
                      transition: 'all 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={`text-sm font-bold ${
                    currentStep === 0 ? 'text-white' : 'text-slate-300'
                  }`}
                    style={{
                      transition: 'color 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                    }}
                  >
                    Upload Data
                  </h3>
                  <p className={`text-xs ${
                    currentStep === 0 ? 'text-slate-300' : 'text-slate-500'
                  }`}
                    style={{
                      transition: 'color 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                    }}
                  >
                    Your CSV file
                  </p>
                </div>
                {(currentStep === 0 || hoveredStep === 0) && (
                  <div className="text-[10px] font-semibold text-teal-300 uppercase tracking-wider px-2 py-1 rounded bg-teal-500/10 whitespace-nowrap">
                    1 / 3
                  </div>
                )}
              </div>

              <div
                className="my-1 h-px w-full shrink-0"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
                }}
                aria-hidden
              />

              {/* Step 2: Ask */}
              <div
                className="w-full flex items-center gap-4 p-4 rounded-xl cursor-default group"
                style={{
                  background: currentStep === 1 
                    ? 'linear-gradient(135deg, rgba(90,78,227,0.15) 0%, rgba(90,78,227,0.05) 100%)'
                    : 'transparent',
                  border: currentStep === 1 
                    ? '1px solid rgba(90,78,227,0.3)' 
                    : '1px solid rgba(255,255,255,0.05)',
                  transition: 'all 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                }}
                onMouseEnter={() => setHoveredStep(1)}
                onMouseLeave={() => setHoveredStep(null)}
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                    currentStep === 1 || hoveredStep === 1 ? 'scale-110' : 'scale-100'
                  }`}
                  style={{
                    background: currentStep === 1 
                      ? 'rgba(90,78,227,0.2)' 
                      : hoveredStep === 1 ? 'rgba(90,78,227,0.15)' : 'rgba(255,255,255,0.05)',
                    border: currentStep === 1 
                      ? '1.5px solid rgba(90,78,227,0.5)' 
                      : '1px solid rgba(255,255,255,0.1)',
                    transition: 'all 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                  }}
                >
                  <MessageSquare
                    className={`h-6 w-6 ${
                      currentStep === 1 ? 'text-indigo-300' : 'text-slate-500'
                    }`}
                    style={{
                      transition: 'all 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={`text-sm font-bold ${
                    currentStep === 1 ? 'text-white' : 'text-slate-300'
                  }`}
                    style={{
                      transition: 'color 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                    }}
                  >
                    Ask Questions
                  </h3>
                  {currentStep === 1 ? (
                    <p className="text-xs text-indigo-300 font-mono break-words" style={{ animation: 'fadeIn 300ms ease-out' }}>
                      &quot;{displayedText}<span className="animate-pulse">|</span>&quot;
                    </p>
                  ) : (
                    <p className={`text-xs ${
                      currentStep === 1 ? 'text-slate-300' : 'text-slate-500'
                    }`}
                      style={{
                        transition: 'color 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                      }}
                    >
                      In plain English
                    </p>
                  )}
                </div>
                {(currentStep === 1 || hoveredStep === 1) && (
                  <div className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider px-2 py-1 rounded bg-indigo-500/10 whitespace-nowrap">
                    2 / 3
                  </div>
                )}
              </div>

              <div
                className="my-1 h-px w-full shrink-0"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
                }}
                aria-hidden
              />

              {/* Step 3: Insights */}
              <div
                className="w-full flex items-center gap-4 p-4 rounded-xl cursor-default group"
                style={{
                  background: currentStep === 2 
                    ? 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(168,85,247,0.05) 100%)'
                    : 'transparent',
                  border: currentStep === 2 
                    ? '1px solid rgba(168,85,247,0.3)' 
                    : '1px solid rgba(255,255,255,0.05)',
                  transition: 'all 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                }}
                onMouseEnter={() => setHoveredStep(2)}
                onMouseLeave={() => setHoveredStep(null)}
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                    currentStep === 2 || hoveredStep === 2 ? 'scale-110' : 'scale-100'
                  }`}
                  style={{
                    background: currentStep === 2 
                      ? 'rgba(168,85,247,0.2)' 
                      : hoveredStep === 2 ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.05)',
                    border: currentStep === 2 
                      ? '1.5px solid rgba(168,85,247,0.5)' 
                      : '1px solid rgba(255,255,255,0.1)',
                    transition: 'all 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                  }}
                >
                  <Sparkles
                    className={`h-6 w-6 ${
                      currentStep === 2 ? 'text-purple-300' : 'text-slate-500'
                    }`}
                    style={{
                      transition: 'all 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={`text-sm font-bold ${
                    currentStep === 2 ? 'text-white' : 'text-slate-300'
                  }`}
                    style={{
                      transition: 'color 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                    }}
                  >
                    Get Insights
                  </h3>
                  {currentStep === 2 ? (
                    <div className="flex items-center gap-1" style={{ animation: 'fadeIn 300ms ease-out' }}>
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1 rounded-full bg-gradient-to-t from-purple-400 to-purple-300"
                          style={{
                            height: `${8 + (i * 4)}px`,
                            animation: `bounce 1.2s ease-in-out infinite`,
                            animationDelay: `${i * 0.15}s`,
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className={`text-xs ${
                      currentStep === 2 ? 'text-slate-300' : 'text-slate-500'
                    }`}
                      style={{
                        transition: 'color 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                      }}
                    >
                      AI-powered analysis
                    </p>
                  )}
                </div>
                {(currentStep === 2 || hoveredStep === 2) && (
                  <div className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider px-2 py-1 rounded bg-purple-500/10 whitespace-nowrap">
                    3 / 3
                  </div>
                )}
              </div>
            </div>
            </div>
          </div>
        </div>

        {/* User datasets */}
        <section className="mt-20">
          <h2 className="mb-6 flex items-center gap-3">
            <span
              className="h-5 w-0.5 rounded-full"
              style={{ background: 'linear-gradient(to bottom, #3CE0D6, #5A4EE3)' }}
            />
            <UploadCloud className="h-4 w-4 text-slate-600" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Your datasets
            </span>
          </h2>
          {datasets.length === 0 ? (
            <div
              className="rounded-2xl px-5 py-12 text-center transition-all duration-300 hover:shadow-lg"
              style={{
                border: '1px dashed rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              <div className="mb-3 flex justify-center">
                <UploadCloud className="h-8 w-8 text-slate-500" />
              </div>
              <p className="text-sm font-medium text-slate-400">No uploads yet</p>
              <p className="mt-1 text-xs text-slate-500">Start by uploading a CSV to analyze your own data</p>
              <button
                type="button"
                onClick={openUploadModal}
                className="mt-4 text-sm font-medium text-brand-indigo-light transition-colors hover:text-white"
              >
                Upload a CSV
              </button>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {datasets.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => void openDataset(d)}
                    disabled={openingId !== null}
                    className="group flex w-full items-start gap-3 rounded-2xl p-5 text-left disabled:opacity-60 transition-all duration-300 hover:shadow-xl"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(60,224,214,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)';
                    }}
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <Database className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-100">{d.name}</span>
                      <p className="mt-1 text-xs text-slate-500">
                        {d.rowCount != null ? `${d.rowCount.toLocaleString()} rows` : 'Your data'}
                      </p>
                      <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-indigo-light group-hover:text-white transition-colors duration-150">
                        {openingId === d.id ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Opening…
                          </>
                        ) : (
                          <>
                            Open dataset
                            <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-1" />
                          </>
                        )}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
