'use client';
import { X } from 'lucide-react';
import { ACCENTS, AccentColor } from './colors';

/** Modal estandar: header con icono+titulo sobre degradado del acento, cuerpo
 * con scroll propio, footer opcional para los botones de accion. `maxWidth`
 * cubre los anchos ya usados en el proyecto (md=formularios cortos, lg/xl=
 * formularios con tabla interna, 3xl=calculadoras/paneles grandes). */
export function Modal({
  title, subtitle, icon: Icon, color = 'amber', onClose, children, footer,
  maxWidth = 'lg',
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ size?: number }>;
  color?: AccentColor;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'md' | 'lg' | 'xl' | '3xl';
}) {
  const accent = ACCENTS[color];
  const widthCls = { md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '3xl': 'max-w-3xl' }[maxWidth];
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-3xl shadow-2xl w-full ${widthCls} max-h-[90vh] overflow-hidden flex flex-col`}>
        <div className={`px-6 py-5 border-b flex justify-between items-center bg-gradient-to-r ${accent.modalGradient}`}>
          <div>
            <h3 className="font-extrabold text-xl text-slate-900 flex items-center gap-2">
              {Icon && <Icon size={20} />} {title}
            </h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={20} /></button>
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
