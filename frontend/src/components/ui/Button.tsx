'use client';
import { RefreshCw } from 'lucide-react';
import { ACCENTS, AccentColor } from './colors';

type Variant = 'primary' | 'secondary' | 'danger';

const BASE = 'rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const SIZES = { sm: 'px-4 py-2 text-xs', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-sm' };

export function Button({
  variant = 'primary', color = 'amber', size = 'md', icon: Icon, loading, disabled, onClick, type = 'button', form, children,
}: {
  variant?: Variant;
  color?: AccentColor;
  size?: keyof typeof SIZES;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  /** Fuerza el icono de carga (RefreshCw girando) e implica disabled. */
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  form?: string;
  children: React.ReactNode;
}) {
  const accent = ACCENTS[color];
  const variantCls =
    variant === 'primary' ? `text-white shadow-md ${accent.buttonBg}` :
    variant === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white shadow-md' :
    'border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white';
  const iconSize = size === 'sm' ? 12 : 14;
  return (
    <button type={type} form={form} onClick={onClick} disabled={disabled || loading} className={`${BASE} ${SIZES[size]} ${variantCls}`}>
      {loading ? <RefreshCw size={iconSize} className="animate-spin" /> : Icon ? <Icon size={iconSize} /> : null}
      {children}
    </button>
  );
}
