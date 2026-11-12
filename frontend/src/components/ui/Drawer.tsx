'use client';
import { X } from 'lucide-react';
import { useCierreVentana } from './useCierreVentana';
import { FOCO, FOCO_DENTRO, RESERVA_BOTON_IA, RESERVA_BOTON_IA_PIE } from '@/lib/design-system';

/** Panel lateral deslizante (detalle de un registro de una tabla). Mismo
 * ancho/blur/z-index en todo el proyecto; header y footer son slots libres
 * porque su contenido (badges de estado, botones de accion) varia bastante
 * de una pagina a otra. B4 T24 (F40): se cierra con Esc (si es la capa de arriba) y con un clic en el fondo (useCierreVentana),
 * salvo con cierreExterno={false}; la X lleva aria-label. B4 T24 f2 r1 (C3): maxWidth '600' y reservaBotonIA, aditivas (el panel
 * rápido del Hub). */
export function Drawer({
  onClose, header, children, footer, maxWidth = 'lg', cierreExterno = true, bloquearCierre = false, etiqueta, idTitulo,
  reservaBotonIA = false,
}: {
  onClose: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** B4 T24 f2 r1 (C3): '600', el ancho del panel rápido del Hub (600 px; a todo el ancho en un teléfono). Aditivo. */
  maxWidth?: 'md' | 'lg' | '600';
  /** B4 T24 (F40): false para que Esc y el clic en el fondo no lo cierren (por defecto, sí). */
  cierreExterno?: boolean;
  /** B4 T24 r1 (C2): true mientras guarda: la X queda deshabilitada y nada lo cierra desde fuera (como bloquearCierre del Modal). */
  bloquearCierre?: boolean;
  /** B4 T24 r2 (m18): el nombre accesible del panel (aria-label; el header es un slot libre). Aditivo. */
  etiqueta?: string;
  /** B4 T24 r3 (m7): el id del título visible del encabezado (aria-labelledby): lo que se anuncia es lo que se ve. Gana sobre etiqueta. */
  idTitulo?: string;
  /** B4 T24 f2 r1 (C3): true para que el cuerpo que se desplaza deje libre, al fondo, la esquina del botón de la IA (RESERVA_BOTON_IA,
   * F44-a). Aditivo: por defecto, sin la reserva. */
  reservaBotonIA?: boolean;
}) {
  const widthCls = maxWidth === 'md' ? 'max-w-md' : maxWidth === '600' ? 'max-w-[600px]' : 'max-w-lg';
  const { alPresionar, alSoltar, refPanel } = useCierreVentana(onClose, bloquearCierre || !cierreExterno);
  return (
    <div onPointerDown={alPresionar} onClick={alSoltar} className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
      <div ref={refPanel} tabIndex={-1} role="dialog" aria-modal="true" data-capa="" aria-labelledby={idTitulo} aria-label={idTitulo ? undefined : etiqueta} className={`w-full ${widthCls} bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col ${FOCO_DENTRO}`}>
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between bg-slate-50/70">
          {header}
          <button type="button" onClick={onClose} disabled={bloquearCierre} aria-label="Cerrar" className={`p-2 text-slate-400 hover:bg-slate-100 rounded-full shrink-0 disabled:opacity-40 ${FOCO}`}>
            <X size={18} />
          </button>
        </div>
        <div className={`flex-1 overflow-y-auto p-6 space-y-6${reservaBotonIA ? ` ${RESERVA_BOTON_IA}` : ''}`}>
          {children}
        </div>
        {footer && (
          // B4 T24 f3 r1 (m43): el pie reserva a la derecha el área del botón de la IA (RESERVA_BOTON_IA_PIE): su botón de la derecha
          // queda entero a la vista.
          <div className={`p-6 ${RESERVA_BOTON_IA_PIE} border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
