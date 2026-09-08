"use client";

import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type ToastProps = {
  msg: string;
  type?: ToastType;
  onClose: () => void;
  durationMs?: number;
};

const CONFIG: Record<ToastType, { bg: string; icon: React.ReactNode }> = {
  success: { bg: 'bg-white border border-[#C2D987] shadow-lg', icon: <CheckCircle2 size={18} className="text-[#7A9A40]" /> },
  error:   { bg: 'bg-white border border-[#F6BAD6] shadow-lg', icon: <AlertCircle  size={18} className="text-[#E55B8A]" /> },
  warning: { bg: 'bg-white border border-[#F9BF92] shadow-lg', icon: <AlertTriangle size={18} className="text-[#C47A3A]" /> },
  info:    { bg: 'bg-white border border-[#B5E1F6] shadow-lg', icon: <Info          size={18} className="text-[#3A8FC4]" /> },
};

export function Toast({ msg, type = 'success', onClose, durationMs = 3800 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, durationMs);
    return () => clearTimeout(t);
  }, [onClose, durationMs]);

  const { bg, icon } = CONFIG[type];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed bottom-8 right-4 sm:right-8 z-[200] flex items-center gap-3 ${bg} text-[#1C1C1E] px-4 py-3.5 rounded-2xl max-w-sm w-full sm:w-auto shadow-xl`}
      style={{ animation: 'toastIn 0.3s ease-out' }}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="font-semibold text-sm flex-1">{msg}</span>
      <button
        onClick={onClose}
        aria-label="Cerrar notificación"
        className="p-1 rounded-full hover:bg-[#FFF5FA] text-[#8A8A8E] hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
      >
        <X size={14} />
      </button>
      <style jsx>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(1rem); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="alert"] { animation: none; }
        }
      `}</style>
    </div>
  );
}

/** Minimal inline toast used in admin dashboard pages */
export function DashboardToast({ msg, type = 'success', onClose }: ToastProps) {
  return <Toast msg={msg} type={type} onClose={onClose} />;
}
