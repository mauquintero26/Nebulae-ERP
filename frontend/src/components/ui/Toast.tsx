'use client';
import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export type ToastMsg = { msg: string; type: 'ok' | 'error' } | null;

/** Notificacion flotante estandar. Se auto-cierra a los 3.5s; el caller solo
 * necesita guardar `useState<ToastMsg>(null)` y renderizar esto cuando exista. */
export function Toast({ toast, onClose }: { toast: ToastMsg; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-[100] px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold flex items-center gap-2 ${
      toast.type === 'ok' ? 'bg-emerald-600' : 'bg-red-600'
    }`}>
      {toast.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      {toast.msg}
      <button onClick={onClose} className="ml-1 opacity-80 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}
