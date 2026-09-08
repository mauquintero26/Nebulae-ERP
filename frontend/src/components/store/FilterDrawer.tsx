"use client";

/**
 * FilterDrawer — Drawer de filtros para móvil
 *
 * Panel deslizante que aparece desde la izquierda en dispositivos móviles.
 * En WEB-1: estructura visual y tipada.
 * En WEB-2: conexión a filtros server-side y atributos dinámicos por categoría.
 */

import { X, SlidersHorizontal, RefreshCw } from 'lucide-react';
import type { FilterState } from '@/types/store';

type Props = {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onChange: (key: keyof FilterState, value: string) => void;
  onClear: () => void;
  categorias?: Array<{ nombre: string; sub_categorias?: string[] }>;
  marcas?: string[];
  hasActiveFilters: boolean;
};

export function FilterDrawer({
  open, onClose, filters, onChange, onClear,
  categorias = [], marcas = [], hasActiveFilters,
}: Props) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filtros de búsqueda"
        className="fixed inset-y-0 left-0 z-50 w-80 max-w-[90vw] bg-white shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: 'slideInLeft 0.25s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0E0EC]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-[#ED87B6]" />
            <h2 className="font-black text-[#1C1C1E] text-base">Filtros</h2>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={onClear}
                className="flex items-center gap-1 text-xs font-bold text-[#ED87B6] hover:text-[#E06FA3] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded px-1"
              >
                <RefreshCw size={12} />
                Limpiar
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[#FFF5FA] text-[#8A8A8E] hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
              aria-label="Cerrar filtros"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filters body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* Búsqueda */}
          <section>
            <label htmlFor="drawer-search" className="block text-xs font-black text-[#4A4A4A] uppercase tracking-widest mb-2">
              Buscar
            </label>
            <input
              id="drawer-search"
              type="search"
              value={filters.search}
              onChange={(e) => onChange('search', e.target.value)}
              placeholder="Nombre de producto..."
              className="w-full border border-[#F0E0EC] rounded-xl px-3 py-2.5 text-sm text-[#1C1C1E] placeholder:text-[#8A8A8E] focus:outline-none focus:ring-2 focus:ring-[#ED87B6] focus:border-transparent transition-all"
            />
          </section>

          {/* Categoría */}
          {categorias.length > 0 && (
            <section>
              <h3 className="text-xs font-black text-[#4A4A4A] uppercase tracking-widest mb-3">Categoría</h3>
              <div className="space-y-1">
                <button
                  onClick={() => onChange('categoria', '')}
                  className={`w-full text-left text-sm px-3 py-2 rounded-xl transition-colors ${filters.categoria === '' ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold' : 'text-[#4A4A4A] hover:bg-[#FFF5FA] hover:text-[#ED87B6]'}`}
                >
                  Todas las categorías
                </button>
                {categorias.map((cat) => (
                  <div key={cat.nombre}>
                    <button
                      onClick={() => onChange('categoria', cat.nombre)}
                      className={`w-full text-left text-sm px-3 py-2 rounded-xl font-medium transition-colors ${filters.categoria === cat.nombre ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold' : 'text-[#4A4A4A] hover:bg-[#FFF5FA]'}`}
                    >
                      {cat.nombre}
                    </button>
                    {cat.sub_categorias?.map((sub) => {
                      const subName = typeof sub === 'string' ? sub : (sub as { nombre: string }).nombre;
                      return (
                        <button
                          key={subName}
                          onClick={() => onChange('categoria', subName)}
                          className={`w-full text-left text-xs px-5 py-1.5 rounded-xl transition-colors ${filters.categoria === subName ? 'text-[#ED87B6] font-bold' : 'text-[#8A8A8E] hover:text-[#ED87B6]'}`}
                        >
                          → {subName}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Precio */}
          <section>
            <h3 className="text-xs font-black text-[#4A4A4A] uppercase tracking-widest mb-3">Precio (COP)</h3>
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="drawer-precio-min" className="sr-only">Precio mínimo</label>
                <input
                  id="drawer-precio-min"
                  type="number"
                  value={filters.precioMin}
                  onChange={(e) => onChange('precioMin', e.target.value)}
                  placeholder="Mínimo"
                  className="w-full border border-[#F0E0EC] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ED87B6] focus:border-transparent"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="drawer-precio-max" className="sr-only">Precio máximo</label>
                <input
                  id="drawer-precio-max"
                  type="number"
                  value={filters.precioMax}
                  onChange={(e) => onChange('precioMax', e.target.value)}
                  placeholder="Máximo"
                  className="w-full border border-[#F0E0EC] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ED87B6] focus:border-transparent"
                />
              </div>
            </div>
          </section>

          {/* Marcas */}
          {marcas.length > 0 && (
            <section>
              <h3 className="text-xs font-black text-[#4A4A4A] uppercase tracking-widest mb-3">Marca</h3>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                <button
                  onClick={() => onChange('marca', '')}
                  className={`w-full text-left text-sm px-3 py-2 rounded-xl transition-colors ${filters.marca === '' ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold' : 'text-[#4A4A4A] hover:bg-[#FFF5FA]'}`}
                >
                  Todas las marcas
                </button>
                {marcas.map((m) => (
                  <button
                    key={m}
                    onClick={() => onChange('marca', m)}
                    className={`w-full text-left text-sm px-3 py-2 rounded-xl transition-colors ${filters.marca === m ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold' : 'text-[#4A4A4A] hover:bg-[#FFF5FA]'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Modalidad */}
          <section>
            <h3 className="text-xs font-black text-[#4A4A4A] uppercase tracking-widest mb-3">Disponibilidad</h3>
            <div className="space-y-1">
              {[
                { value: '', label: 'Todas' },
                { value: 'ENTREGA_INMEDIATA', label: 'Entrega inmediata' },
                { value: 'POR_PEDIDO',        label: 'Por pedido' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onChange('modalidad', value)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-xl transition-colors ${filters.modalidad === value ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold' : 'text-[#4A4A4A] hover:bg-[#FFF5FA]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* WEB-2 placeholder */}
          <div className="rounded-xl bg-[#F0F9FF] border border-[#B5E1F6] p-4">
            <p className="text-xs text-[#3A8FC4] font-bold">
              🔵 WEB-2: Filtros por talla, color y atributos dinámicos por categoría se conectarán al backend en la siguiente fase.
            </p>
          </div>
        </div>

        {/* Apply button */}
        <div className="px-5 py-4 border-t border-[#F0E0EC]">
          <button
            onClick={onClose}
            className="w-full py-3 bg-[#ED87B6] hover:bg-[#E06FA3] text-white font-bold rounded-full text-sm transition-all focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2 focus-visible:outline-none shadow-md"
          >
            Ver resultados
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="slideInLeft"] { animation: none; }
        }
      `}</style>
    </>
  );
}
