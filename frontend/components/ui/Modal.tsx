import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  hideCloseBtn?: boolean;
}

export function Modal({ isOpen, onClose, title, children, className, hideCloseBtn }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full max-w-[540px] flex flex-col pt-8 pb-10 px-10 rounded-[20px]",
          "bg-gradient-to-br from-[#161C28] to-[#121620] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)] animate-in fade-in zoom-in-95 duration-200",
          className
        )}
      >
        {(title || !hideCloseBtn) && (
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            {!hideCloseBtn && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-200 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
