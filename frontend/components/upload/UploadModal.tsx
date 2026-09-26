'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { uploadDataset } from '@/lib/api/datasets';
import { createConversation } from '@/lib/api/conversations';
import { useDatasets } from '@/lib/hooks/useDatasets';
import { isRateLimitError, parseRateLimitError } from '@/lib/api/errors';
import { toFriendlyErrorMessage } from '@/lib/utils/errorMessages';
import PIISummaryBanner from './PIISummaryBanner';
import UnderstandingCard from './UnderstandingCard';
import { InlineCorrectionPanel } from '@/components/semantic/InlineCorrectionPanel';
import { RateLimitErrorPanel } from '@/components/chat/RateLimitErrorPanel';
import { UploadCloud, ShieldAlert, ChevronRight, RotateCcw, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { PiiSummary } from '@/types';

interface UploadModalProps {
  onClose: () => void;
}

export default function UploadModal({ onClose }: UploadModalProps) {
  const { setActiveDataset, refreshDatasets } = useDatasets();
  const router = useRouter();

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | undefined>(undefined);
  const [isWaitingForRateLimit, setIsWaitingForRateLimit] = useState(false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [piiSummary, setPiiSummary] = useState<PiiSummary | null>(null);
  const [originalFileMemo, setOriginalFileMemo] = useState<File | null>(null);
  const [understandingCard, setUnderstandingCard] = useState<string | null>(null);
  const [uploadedDatasetId, setUploadedDatasetId] = useState<string | null>(null);
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [fileDetails, setFileDetails] = useState<{ name: string; size: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'scanning' | 'processing' | 'complete'>('scanning');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);

  // Auto-retry after rate limit countdown finishes
  useEffect(() => {
    if (!isWaitingForRateLimit || !retryAfterSeconds || retryAfterSeconds <= 0 || !pendingFileRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      void performUpload(pendingFileRef.current!);
    }, retryAfterSeconds * 1000);

    return () => clearTimeout(timer);
  }, [isWaitingForRateLimit, retryAfterSeconds]);

  // Simulate progress bar while uploading
  useEffect(() => {
    if (!isProcessing) {
      setUploadProgress(0);
      setUploadStatus('scanning');
      return;
    }

    // Start progress
    setUploadProgress(10);
    setUploadStatus('scanning');

    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev < 80) {
          return prev + Math.random() * 15;
        }
        return prev;
      });

      // Update status messages
      setUploadStatus((prev) => {
        if (prev === 'scanning' && Math.random() > 0.6) {
          return 'processing';
        }
        return prev;
      });
    }, 600);

    return () => clearInterval(interval);
  }, [isProcessing]);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const performUpload = useCallback(
    async (file: File) => {
      setIsProcessing(true);
      setError(null);
      setIsWaitingForRateLimit(false);
      setRetryAfterSeconds(undefined);
      setUploadProgress(0);
      setUploadStatus('scanning');
      pendingFileRef.current = null;
      try {
        const result = await uploadDataset(file);
        setPiiSummary(result.piiSummary);
        setUnderstandingCard(result.understandingCard);
        setUploadedDatasetId(result.dataset.id);
        setUploadProgress(100);
        setUploadStatus('complete');
        setStep(3);
        await refreshDatasets();
      } catch (err: unknown) {
        // Check if it's a rate limit error
        if (isRateLimitError(err)) {
          const rateLimitInfo = parseRateLimitError(err);
          const retrySeconds = rateLimitInfo?.retryAfterSeconds || 60;
          // Don't show error - keep processing state and wait silently
          setIsWaitingForRateLimit(true);
          setRetryAfterSeconds(retrySeconds);
          pendingFileRef.current = file;
          // Keep isProcessing true so spinner keeps showing
          return;
        } else {
          const friendlyMessage = toFriendlyErrorMessage(err);
          setError(friendlyMessage);
        }
      } finally {
        if (!isWaitingForRateLimit) {
          setIsProcessing(false);
        }
      }
    },
    [isWaitingForRateLimit],
  );

  const handleProcessFile = useCallback(
    async (file: File) => {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
        setError('That file format isn\'t supported. Please use CSV, XLSX, or XLS files.');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError('Your file is too large. Please upload a file under 50MB.');
        return;
      }

      setFileDetails({ name: file.name, size: formatBytes(file.size) });
      setError(null);
      setPiiSummary(null);
      setUploadedDatasetId(null);
      setCorrectionModalOpen(false);
      setOriginalFileMemo(file);
      setStep(2);
      await performUpload(file);
    },
    [performUpload],
  );

  const handleStartAsking = async () => {
    if (!uploadedDatasetId) return;

    setIsProcessing(true);
    try {
      setActiveDataset(uploadedDatasetId);
      const newConv = await createConversation(uploadedDatasetId, 'New Conversation');
      onClose();
      if (newConv) {
        router.push(`/app/${newConv.id}`);
      }
    } catch (e) {
      console.error(e);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        void handleProcessFile(e.dataTransfer.files[0]);
      }
    },
    [handleProcessFile],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        void handleProcessFile(e.target.files[0]);
      }
    },
    [handleProcessFile],
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        step === 1 ? 'Upload a dataset' : step === 2 ? 'Securing your upload' : 'Analysis complete'
      }
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: step >= s ? '24px' : '8px',
                background:
                  step >= s
                    ? 'linear-gradient(90deg, #5A4EE3, #3CE0D6)'
                    : 'rgba(255,255,255,0.10)',
              }}
            />
          ))}
        </div>

        {error && !isWaitingForRateLimit && (
          <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium mb-2">Upload Failed</p>
              <p className="text-xs text-red-300/90">{error}</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 rounded-xl p-10"
              style={{
                border: isDragging
                  ? '2px dashed rgba(90,78,227,0.7)'
                  : '2px dashed rgba(90,78,227,0.25)',
                background: isDragging ? 'rgba(90,78,227,0.07)' : 'rgba(15,18,26,0.5)',
                boxShadow: isDragging ? 'inset 0 0 40px rgba(90,78,227,0.08)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!isDragging) {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(90,78,227,0.45)';
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(90,78,227,0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isDragging) {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(90,78,227,0.25)';
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(15,18,26,0.5)';
                }
              }}
            >
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                ref={fileInputRef}
                onChange={onFileChange}
              />

              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{
                  background: 'rgba(90,78,227,0.12)',
                  border: '1px solid rgba(90,78,227,0.25)',
                }}
              >
                <UploadCloud className="w-7 h-7 text-brand-indigo-light" strokeWidth={1.5} />
              </div>

              <h3 className="text-base font-semibold text-slate-200 mb-1">Drop your spreadsheet here</h3>
              <div className="text-sm text-slate-500 mb-3 inline-flex items-center gap-1">
                or <span className="text-brand-indigo-light font-medium">click to browse</span>
              </div>
              <p className="text-xs text-slate-600">.csv, .xlsx, .xls · max 50MB</p>
            </div>

            <div
              className="flex items-start gap-3 rounded-xl p-4"
              style={{
                background: 'rgba(60,224,214,0.05)',
                border: '1px solid rgba(60,224,214,0.18)',
              }}
            >
              <div className="mt-0.5 text-emerald-400 shrink-0">
                <ShieldAlert className="w-4 h-4" strokeWidth={2} />
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                On upload, G.I.N.A scans your file on the server, redacts sensitive fields, and only
                stores protected data — aligned with G.I.N.A core security protocols.
              </p>
            </div>

            <div className="flex justify-end items-center mt-1">
              <Button variant="ghost" onClick={onClose} className="mr-0 font-medium">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            {isProcessing ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 flex flex-col items-center gap-4 text-center">
                <div className="w-10 h-10 border-2 border-brand-indigo-light/30 border-t-brand-indigo-light rounded-full animate-spin" />
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-slate-300">
                    {isWaitingForRateLimit
                      ? 'Finalizing upload…'
                      : uploadStatus === 'processing'
                        ? 'Reading your data…'
                        : 'Uploading and scanning for PII…'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {uploadProgress > 0 && uploadProgress < 100
                      ? `${Math.round(uploadProgress)}% complete`
                      : ''}
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-gradient-to-r from-brand-indigo to-brand-teal rounded-full transition-all duration-500"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="border border-emerald-500/30 border-dashed rounded-xl p-6 bg-emerald-500/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold text-[10px] font-mono uppercase border border-emerald-500/20 px-1 text-center leading-tight">
                  {fileDetails?.name?.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLS'}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-base font-bold text-white">
                    {fileDetails?.name || 'dataset.csv'}
                  </span>
                  <span className="text-sm text-slate-400">{fileDetails?.size || 'Unknown size'}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center mt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setStep(1);
                  setError(null);
                }}
                className="px-0 hover:bg-transparent"
              >
                Go back
              </Button>

              {error && !isWaitingForRateLimit && originalFileMemo ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    void performUpload(originalFileMemo);
                  }}
                  disabled={isProcessing}
                  className="gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Retry upload
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {step === 3 && understandingCard && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            {/* Success Feedback */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] px-4 py-3 flex items-start gap-3 animate-in slide-in-from-top duration-500">
              <div className="text-emerald-400 mt-0.5 shrink-0">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-300">✓ Dataset ready</p>
                <p className="text-xs text-emerald-300/70 mt-0.5">Your data is processed and secure. Ask your first question!</p>
              </div>
            </div>

            {piiSummary ? <PIISummaryBanner summary={piiSummary} /> : null}

            <UnderstandingCard
              text={understandingCard}
              onCorrectionClick={() => setCorrectionModalOpen((prev) => !prev)}
            />
            {correctionModalOpen && uploadedDatasetId && (
              <InlineCorrectionPanel
                datasetId={uploadedDatasetId}
                onClose={() => setCorrectionModalOpen(false)}
                onSuccess={(state) => {
                  setUnderstandingCard(state.understandingCard);
                  setCorrectionModalOpen(false);
                  void refreshDatasets();
                }}
              />
            )}

            <div className="flex justify-between items-center mt-2 border-t border-surface-border pt-6">
              <Button
                variant="ghost"
                onClick={() => {
                  setStep(1);
                  setPiiSummary(null);
                  setUnderstandingCard(null);
                  setUploadedDatasetId(null);
                  setOriginalFileMemo(null);
                  setFileDetails(null);
                }}
                className="px-0 hover:bg-transparent"
              >
                Upload another
              </Button>
              <Button
                variant="primary"
                onClick={handleStartAsking}
                disabled={isProcessing}
                className="gap-2 group"
              >
                {isProcessing ? (
                  <>
                    Starting...{' '}
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </>
                ) : (
                  <>
                    Start asking questions
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
