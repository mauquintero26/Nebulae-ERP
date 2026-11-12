'use client';
import { ACCENTS, AccentColor } from './colors';

/** Encabezado estandar de pagina: icono + titulo + subtitulo + accion primaria opcional.
 * `actions` para mas de un boton/adorno a la derecha (reemplaza a `onAction`/`actionLabel`).
 * B4 T24 (F43): en pantallas angostas el titulo se achica (text-2xl hasta sm) y se parte, y las acciones bajan cuando no caben
 * (flex-wrap): a 375 px y a 768 px con el menu abierto el main ya no se desplaza de lado. */
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
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
          <div className={`p-2 rounded-xl shadow-inner shrink-0 ${accent.headerIconBg}`}><Icon size={24} /></div>
          <span className="min-w-0 break-words">{title}</span>
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
