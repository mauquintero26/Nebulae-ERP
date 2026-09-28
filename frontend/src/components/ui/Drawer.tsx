'use client';
import { X } from 'lucide-react';

/** Panel lateral deslizante (detalle de un registro de una tabla). Mismo
 * ancho/blur/z-index en todo el proyecto; header y footer son slots libres
 * porque su contenido (badges de estado, botones de accion) varia bastante
 * de una pagina a otra. */
export function Drawer({
  onClose, header, children, footer, maxWidth = 'lg',
}: {
  onClose: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'md' | 'lg';
}) {
  const widthCls = maxWidth === 'md' ? 'max-w-md' : 'max-w-lg';
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
      <div className={`w-full ${widthCls} bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col`}>
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between bg-slate-50/70">
          {header}
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {children}
        </div>
        {footer && (
          <div className="p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
