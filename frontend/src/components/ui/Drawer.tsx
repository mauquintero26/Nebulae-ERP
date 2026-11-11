'use client';
import { X } from 'lucide-react';
import { useCierreVentana } from './useCierreVentana';
import { FOCO, FOCO_DENTRO } from '@/lib/design-system';

/** Panel lateral deslizante (detalle de un registro de una tabla). Mismo
 * ancho/blur/z-index en todo el proyecto; header y footer son slots libres
 * porque su contenido (badges de estado, botones de accion) varia bastante
 * de una pagina a otra. B4 T24 (F40): se cierra con Esc (si es la capa de arriba) y con un clic en el fondo (useCierreVentana),
 * salvo con cierreExterno={false}; la X lleva aria-label. */
export function Drawer({
  onClose, header, children, footer, maxWidth = 'lg', cierreExterno = true, bloquearCierre = false,
}: {
  onClose: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'md' | 'lg';
  /** B4 T24 (F40): false para que Esc y el clic en el fondo no lo cierren (por defecto, sí). */
  cierreExterno?: boolean;
  /** B4 T24 r1 (C2): true mientras guarda: la X queda deshabilitada y nada lo cierra desde fuera (como bloquearCierre del Modal). */
  bloquearCierre?: boolean;
}) {
  const widthCls = maxWidth === 'md' ? 'max-w-md' : 'max-w-lg';
  const { alPresionar, alSoltar, refPanel } = useCierreVentana(onClose, bloquearCierre || !cierreExterno);
  return (
    <div onPointerDown={alPresionar} onClick={alSoltar} className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
      <div ref={refPanel} tabIndex={-1} role="dialog" aria-modal="true" className={`w-full ${widthCls} bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col ${FOCO_DENTRO}`}>
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between bg-slate-50/70">
          {header}
          <button type="button" onClick={onClose} disabled={bloquearCierre} aria-label="Cerrar" className={`p-2 text-slate-400 hover:bg-slate-100 rounded-full shrink-0 disabled:opacity-40 ${FOCO}`}>
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
