'use client';
import { useId } from 'react';
import { X } from 'lucide-react';
import { ACCENTS, AccentColor } from './colors';

/** Modal estandar: header con icono+titulo sobre degradado del acento, cuerpo
 * con scroll propio, footer opcional para los botones de accion. `maxWidth`
 * cubre los anchos ya usados en el proyecto (md=formularios cortos, lg/xl=
 * formularios con tabla interna, 3xl=calculadoras/paneles grandes).
 * `capa='encima'` (z-[60]) la pone sobre los modales de la pagina (z-50), p. ej.
 * las confirmaciones de useAvisos; el modal de sesion vencida (z-[100]) sigue encima.
 * `bloquearCierre` deshabilita la X (p. ej. mientras la ventana guarda); el onClose del llamador
 * tambien debe ignorar el cierre en ese momento. */
export function Modal({
  title, subtitle, icon: Icon, color = 'amber', onClose, children, footer,
  maxWidth = 'lg', capa = 'base', role = 'dialog', describedBy, bloquearCierre = false,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ size?: number }>;
  color?: AccentColor;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** B3 T17: '4xl' para la calculadora de la cotización con la columna IVA. */
  maxWidth?: 'md' | 'lg' | 'xl' | '3xl' | '4xl';
  capa?: 'base' | 'encima';
  role?: 'dialog' | 'alertdialog';
  /** id del texto que describe la ventana (aria-describedby), p. ej. el mensaje de una confirmación. */
  describedBy?: string;
  /** true: la X queda deshabilitada (la ventana está guardando). */
  bloquearCierre?: boolean;
}) {
  const accent = ACCENTS[color];
  const widthCls = { md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl' }[maxWidth];
  const capaCls = capa === 'encima' ? 'z-[60]' : 'z-50';
  const tituloId = useId();
  return (
    <div className={`fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center ${capaCls} p-4`}>
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={describedBy}
        className={`bg-white rounded-3xl shadow-2xl w-full ${widthCls} max-h-[90vh] overflow-hidden flex flex-col`}
      >
        <div className={`px-6 py-5 border-b flex justify-between items-center bg-gradient-to-r ${accent.modalGradient}`}>
          <div>
            <h3 id={tituloId} className="font-extrabold text-xl text-slate-900 flex items-center gap-2">
              {Icon && <Icon size={20} />} {title}
            </h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} disabled={bloquearCierre} aria-label="Cerrar" className="p-2 text-slate-400 hover:bg-slate-100 rounded-full disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {children}
        </div>
        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-3xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
