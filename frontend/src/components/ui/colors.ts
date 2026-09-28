// Tokens de color compartidos por los componentes de ui/. Cada hub conserva
// su propio color de acento (Inventario=amber, Compras=orange/purple segun
// submodulo, Ventas=indigo, etc.) -- este mapa solo centraliza las clases de
// Tailwind ya usadas en el proyecto para que no varien de una pagina a otra.
// Deben ser strings literales completos (no interpolados) para que el JIT de
// Tailwind los detecte.

export type AccentColor =
  | 'amber' | 'rose' | 'orange' | 'indigo' | 'purple'
  | 'emerald' | 'blue' | 'teal' | 'red';

export const ACCENTS: Record<AccentColor, {
  navActive: string;
  navHover: string;
  headerIconBg: string;
  statIconBg: string;
  buttonBg: string;
  modalGradient: string;
  ring: string;
  text: string;
}> = {
  amber:   { navActive: 'bg-amber-600 text-white border-amber-600',     navHover: 'text-slate-600 hover:bg-amber-50 hover:text-amber-700 border-transparent hover:border-amber-200',     headerIconBg: 'bg-amber-100 text-amber-600',     statIconBg: 'bg-amber-50 text-amber-600',     buttonBg: 'bg-amber-600 hover:bg-amber-700',     modalGradient: 'from-amber-50 to-white',     ring: 'focus:ring-amber-200 focus:border-amber-400',     text: 'text-amber-600' },
  rose:    { navActive: 'bg-rose-600 text-white border-rose-600',       navHover: 'text-slate-600 hover:bg-rose-50 hover:text-rose-700 border-transparent hover:border-rose-200',       headerIconBg: 'bg-rose-100 text-rose-600',       statIconBg: 'bg-rose-50 text-rose-600',       buttonBg: 'bg-rose-600 hover:bg-rose-700',       modalGradient: 'from-rose-50 to-white',       ring: 'focus:ring-rose-200 focus:border-rose-400',       text: 'text-rose-600' },
  orange:  { navActive: 'bg-orange-600 text-white border-orange-600',   navHover: 'text-slate-600 hover:bg-orange-50 hover:text-orange-700 border-transparent hover:border-orange-200',   headerIconBg: 'bg-orange-100 text-orange-600',   statIconBg: 'bg-orange-50 text-orange-600',   buttonBg: 'bg-orange-600 hover:bg-orange-700',   modalGradient: 'from-orange-50 to-white',     ring: 'focus:ring-orange-200 focus:border-orange-400',   text: 'text-orange-600' },
  indigo:  { navActive: 'bg-indigo-600 text-white border-indigo-600',   navHover: 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 border-transparent hover:border-indigo-200',   headerIconBg: 'bg-indigo-100 text-indigo-600',   statIconBg: 'bg-indigo-50 text-indigo-600',   buttonBg: 'bg-indigo-600 hover:bg-indigo-700',   modalGradient: 'from-indigo-50 to-white',     ring: 'focus:ring-indigo-200 focus:border-indigo-400',   text: 'text-indigo-600' },
  purple:  { navActive: 'bg-purple-600 text-white border-purple-600',   navHover: 'text-slate-600 hover:bg-purple-50 hover:text-purple-700 border-transparent hover:border-purple-200',   headerIconBg: 'bg-purple-100 text-purple-600',   statIconBg: 'bg-purple-50 text-purple-600',   buttonBg: 'bg-purple-600 hover:bg-purple-700',   modalGradient: 'from-purple-50 to-white',     ring: 'focus:ring-purple-200 focus:border-purple-400',   text: 'text-purple-600' },
  emerald: { navActive: 'bg-emerald-600 text-white border-emerald-600', navHover: 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border-transparent hover:border-emerald-200', headerIconBg: 'bg-emerald-100 text-emerald-600', statIconBg: 'bg-emerald-50 text-emerald-600', buttonBg: 'bg-emerald-600 hover:bg-emerald-700', modalGradient: 'from-emerald-50 to-white',   ring: 'focus:ring-emerald-200 focus:border-emerald-400', text: 'text-emerald-600' },
  blue:    { navActive: 'bg-blue-600 text-white border-blue-600',       navHover: 'text-slate-600 hover:bg-blue-50 hover:text-blue-700 border-transparent hover:border-blue-200',       headerIconBg: 'bg-blue-100 text-blue-600',       statIconBg: 'bg-blue-50 text-blue-600',       buttonBg: 'bg-blue-600 hover:bg-blue-700',       modalGradient: 'from-blue-50 to-white',       ring: 'focus:ring-blue-200 focus:border-blue-400',       text: 'text-blue-600' },
  teal:    { navActive: 'bg-teal-600 text-white border-teal-600',       navHover: 'text-slate-600 hover:bg-teal-50 hover:text-teal-700 border-transparent hover:border-teal-200',       headerIconBg: 'bg-teal-100 text-teal-600',       statIconBg: 'bg-teal-50 text-teal-600',       buttonBg: 'bg-teal-600 hover:bg-teal-700',       modalGradient: 'from-teal-50 to-white',       ring: 'focus:ring-teal-200 focus:border-teal-400',       text: 'text-teal-600' },
  red:     { navActive: 'bg-red-600 text-white border-red-600',         navHover: 'text-slate-600 hover:bg-red-50 hover:text-red-700 border-transparent hover:border-red-200',         headerIconBg: 'bg-red-100 text-red-600',         statIconBg: 'bg-red-50 text-red-600',         buttonBg: 'bg-red-600 hover:bg-red-700',         modalGradient: 'from-red-50 to-white',         ring: 'focus:ring-red-200 focus:border-red-400',         text: 'text-red-600' },
};

// Tonos semanticos para Badge -- independientes del acento del hub (un badge
// "Cancelado" es rojo aunque este en una pagina de acento ambar).
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

export const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  danger:  'bg-red-50 text-red-700 border-red-200',
  info:    'bg-blue-50 text-blue-700 border-blue-200',
  purple:  'bg-purple-50 text-purple-700 border-purple-200',
};
