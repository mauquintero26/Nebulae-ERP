'use client';
import Link from 'next/link';
import { ACCENTS, AccentColor } from './colors';

export interface SubNavItem { name: string; path: string; }

/** Barra de submodulos pegajosa arriba de cada hub (Compras/Inventario/Ventas/etc).
 * Mismo patron visual en todas las paginas, solo cambia el color de acento y los items. */
export function SubNav({
  label, items, currentPath, color = 'amber',
}: {
  label: string;
  items: SubNavItem[];
  currentPath: string;
  color?: AccentColor;
}) {
  const accent = ACCENTS[color];
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-2.5 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
      <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-3 shrink-0">{label}:</span>
      {items.map(item => (
        <Link key={item.name} href={item.path}
          className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ${
            item.path === currentPath ? accent.navActive : accent.navHover
          }`}>
          {item.name}
        </Link>
      ))}
    </div>
  );
}
