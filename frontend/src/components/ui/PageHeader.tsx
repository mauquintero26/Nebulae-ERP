'use client';
import { ACCENTS, AccentColor } from './colors';

/** Encabezado estandar de pagina: icono + titulo + subtitulo + accion primaria opcional.
 * `actions` para mas de un boton/adorno a la derecha (reemplaza a `onAction`/`actionLabel`). */
export function PageHeader({
  icon: Icon, title, subtitle, color = 'amber',
  actionLabel, onAction, actionIcon: ActionIcon,
  actions,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  subtitle?: string;
  color?: AccentColor;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ComponentType<{ size?: number }>;
  actions?: React.ReactNode;
}) {
  const accent = ACCENTS[color];
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
          <div className={`p-2 rounded-xl shadow-inner ${accent.headerIconBg}`}><Icon size={24} /></div>
          {title}
        </h1>
        {subtitle && <p className="text-slate-500 mt-2 font-medium text-sm">{subtitle}</p>}
      </div>
      {actions ?? (onAction && actionLabel && (
        <button onClick={onAction}
          className={`text-white px-6 py-3 rounded-xl font-bold shadow-md flex items-center gap-2 transition-colors ${accent.buttonBg}`}>
          {ActionIcon && <ActionIcon size={18} />} {actionLabel}
        </button>
      ))}
    </div>
  );
}
