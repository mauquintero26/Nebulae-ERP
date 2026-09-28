'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ACCENTS, AccentColor } from './colors';

export interface SubNavItem { name: string; path: string; }

/** Barra de submodulos pegajosa arriba de cada hub (Compras/Inventario/Ventas/etc).
 * Mismo patron visual en todas las paginas, solo cambia el color de acento y los items.
 * `hub` es opcional: algunas paginas ya traian un pill "Hub" para volver al landing
 * del hub antes de la lista de submodulos (p.ej. Compras) -- se preserva tal cual. */
export function SubNav({
  label, items, currentPath, color = 'amber', hub,
}: {
  label: string;
  items: SubNavItem[];
  currentPath: string;
  color?: AccentColor;
  hub?: { href: string; label?: string };
}) {
  const accent = ACCENTS[color];
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-2.5 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
      {hub && (
        <>
          <Link href={hub.href} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-100 border border-slate-200 mr-1 transition-colors">
            <ArrowLeft size={12} /> {hub.label ?? 'Hub'}
          </Link>
          <div className="w-px h-4 bg-slate-200 mr-1 shrink-0" />
        </>
      )}
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
