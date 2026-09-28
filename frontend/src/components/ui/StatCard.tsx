'use client';
import { ACCENTS, AccentColor } from './colors';

const GRADIENTS: Record<AccentColor, string> = {
  amber: 'from-amber-500 to-yellow-600', rose: 'from-rose-600 to-red-700',
  orange: 'from-orange-500 to-amber-600', indigo: 'from-indigo-500 to-purple-600',
  purple: 'from-purple-500 to-indigo-600', emerald: 'from-emerald-500 to-teal-600',
  blue: 'from-blue-500 to-indigo-600', teal: 'from-teal-500 to-emerald-600',
  red: 'from-red-600 to-rose-700',
};

/** Tarjeta de metrica (KPI) usada en las filas de "stats" arriba de cada tabla.
 * `tone` permite variantes semanticas (verde para positivo, rojo para negativo)
 * independientes del acento del hub; por defecto usa el acento de la pagina.
 * `variant="gradient"` es la tarjeta "hero" oscura (Diferencia Neta, Protocolo
 * 60/40, etc.) -- mismo tamano/forma que las demas, solo cambia el fondo. */
export function StatCard({
  icon: Icon, label, value, hint, color = 'amber', tone, onClick, variant = 'default',
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
  color?: AccentColor;
  tone?: 'success' | 'danger';
  onClick?: () => void;
  variant?: 'default' | 'gradient';
}) {
  const resolvedColor = tone === 'success' ? 'emerald' : tone === 'danger' ? 'rose' : color;
  const accent = ACCENTS[resolvedColor];

  if (variant === 'gradient') {
    return (
      <div className={`bg-gradient-to-br ${GRADIENTS[resolvedColor]} rounded-2xl p-6 text-white shadow-lg relative overflow-hidden ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
        <div className="absolute right-0 top-0 opacity-10"><Icon size={120} /></div>
        <p className="text-xs font-black text-white/80 uppercase tracking-wider mb-1 relative z-10">{label}</p>
        <h2 className="text-4xl font-black text-white relative z-10">{value}</h2>
        {hint && <p className="text-xs font-bold text-white/80 mt-2 relative z-10">{hint}</p>}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group transition-all ${onClick ? 'cursor-pointer hover:border-slate-300' : ''}`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${accent.statIconBg}`}>
        <Icon size={24} />
      </div>
      <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <h2 className="text-4xl font-black text-slate-800">{value}</h2>
      {hint && <p className={`text-xs font-bold mt-2 ${accent.text}`}>{hint}</p>}
    </div>
  );
}
