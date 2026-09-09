"use client";

/**
 * Catálogo — WEB-2A
 *
 * Cambios respecto a WEB-1:
 * - Usa useCatalog hook (no fetch directo): datos, filtros, paginación y URL sync centralizados
 * - Búsqueda con debounce en el hook, spinner de "buscando..." y botón X para limpiar
 * - Persistencia de todos los filtros en URL (?q=, ?categoria=, ?page=, etc.)
 * - Paginación client-side: prev/next, indicador "Página X de Y"
 * - Sort dropdown: Relevancia, Más recientes, Precio asc, Precio desc
 * - Chips de filtros activos con X individual
 * - Badge con conteo de filtros activos en botón móvil
 * - Sidebar desktop: categorías desde API (listCategorias), precio min/max, marcas, modalidad
 * - FilterDrawer para móvil (adaptando CatalogFilterState → FilterState)
 * - EmptyState con "Limpiar filtros" y ErrorState con retry()
 * - SEO: document.title dinámico y h1 visible
 * - Paleta Nebulae, focus-visible en todos los controles, prefers-reduced-motion
 *
 * Paginación client-side temporal — ver WEB2A_GAPS_BACKEND.md GAP-001
 */

import type { Metadata } from 'next';
// Note: Metadata from server component would go here.
// Page title is set via document.title in useEffect for client component.

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Search, SlidersHorizontal, X, RefreshCw, ChevronRight,
  ChevronLeft, ChevronDown, Loader2,
} from 'lucide-react';
import { useCart } from '../layout';
import { ProductCard } from '@/components/store/ProductCard';
import { ProductGridSkeleton, EmptyState, ErrorState } from '@/components/store/States';
import { FilterDrawer } from '@/components/store/FilterDrawer';
import { useCatalog } from '@/hooks/useCatalog';
import { listCategorias } from '@/lib/store-api';
import type { NavNode } from '@/types/store';
import type { FilterState } from '@/types/store';
import type { CatalogFilterState } from '@/lib/store-api';

// ─── Sort options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: '',            label: 'Relevancia' },
  { value: 'recientes',   label: 'Más recientes' },
  { value: 'precio_asc',  label: 'Precio: menor a mayor' },
  { value: 'precio_desc', label: 'Precio: mayor a menor' },
];

// ─── Adapter: CatalogFilterState → FilterState (for FilterDrawer) ─────────────

function toFilterState(f: CatalogFilterState): FilterState {
  return {
    search:         f.search,
    categoria:      f.categoria,
    subcategoria:   f.subcategoria,
    marca:          f.marca,
    precioMin:      f.precioMin,
    precioMax:      f.precioMax,
    modalidad:      f.modalidad,
    disponibilidad: f.disponibilidad,
    talla:          f.talla,
    color:          f.color,
  };
}

// ─── Filter chip helper ───────────────────────────────────────────────────────

type ActiveChip = { key: keyof CatalogFilterState; label: string };

function buildChips(filters: CatalogFilterState): ActiveChip[] {
  const chips: ActiveChip[] = [];
  if (filters.search)       chips.push({ key: 'search',      label: `"${filters.search}"` });
  if (filters.categoria)    chips.push({ key: 'categoria',   label: filters.categoria });
  if (filters.subcategoria) chips.push({ key: 'subcategoria', label: filters.subcategoria });
  if (filters.marca)        chips.push({ key: 'marca',       label: filters.marca });
  if (filters.precioMin)    chips.push({ key: 'precioMin',   label: `Desde $${filters.precioMin}` });
  if (filters.precioMax)    chips.push({ key: 'precioMax',   label: `Hasta $${filters.precioMax}` });
  if (filters.modalidad) {
    const label = filters.modalidad === 'ENTREGA_INMEDIATA' ? 'Entrega inmediata' : 'Por pedido';
    chips.push({ key: 'modalidad', label });
  }
  if (filters.ordenar) {
    const opt = SORT_OPTIONS.find((o) => o.value === filters.ordenar);
    if (opt) chips.push({ key: 'ordenar', label: opt.label });
  }
  return chips;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CatalogoPage() {
  const { addToCart } = useCart();

  const {
    products,
    filteredCount,
    pagination,
    filters,
    activeFilterCount,
    loading,
    error,
    isRetryable,
    setFilter,
    clearFilters,
    clearFilter,
    retry,
    setPage,
  } = useCatalog();

  // ── Categories from API ────────────────────────────────────────────────────
  const [navNodes, setNavNodes] = useState<NavNode[]>([]);

  useEffect(() => {
    listCategorias().then(setNavNodes).catch(() => {});
  }, []);

  // ── Dynamic page title ─────────────────────────────────────────────────────
  useEffect(() => {
    const title = filters.categoria
      ? `${filters.categoria} — Catálogo | Nebulae Kids`
      : 'Catálogo | Nebulae Kids';
    document.title = title;
  }, [filters.categoria]);

  // ── Drawer (mobile) ───────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Derive marcas from products for sidebar ───────────────────────────────
  // Accumulate known marcas across pages so the list does not collapse on filter change.
  const [knownMarcas, setKnownMarcas] = useState<string[]>([]);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (products.length === 0) return;
    setKnownMarcas((prev) => {
      const next = [...new Set([...prev, ...products.map((p) => p.marca).filter(Boolean)])].sort();
      return next;
    });
  }, [products]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── FilterDrawer adapter: maps DrawerState back to setFilter calls ─────────
  const handleDrawerChange = useCallback(
    (key: keyof FilterState, value: string) => {
      setFilter(key as keyof CatalogFilterState, value);
    },
    [setFilter],
  );

  // ── Active chips ───────────────────────────────────────────────────────────
  const chips = buildChips(filters);
  const hasActiveFilters = activeFilterCount > 0;

  // ── Flatten NavNode[] for FilterDrawer ────────────────────────────────────
  const drawerCategorias = navNodes.map((n) => ({
    nombre: n.label,
    sub_categorias: n.children.map((c) => c.label),
  }));

  // ── Search is active (debounce lag indicator) ─────────────────────────────
  const isSearchActive = filters.search.length > 0;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Mobile filter drawer ── */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={toFilterState(filters)}
        onChange={handleDrawerChange}
        onClear={clearFilters}
        categorias={drawerCategorias}
        marcas={knownMarcas}
        hasActiveFilters={hasActiveFilters}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Breadcrumb ── */}
        <nav aria-label="Ruta de navegación" className="flex items-center gap-1.5 text-xs text-[#8A8A8E] mb-6">
          <Link
            href="/store"
            className="hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded"
          >
            Inicio
          </Link>
          <ChevronRight size={12} aria-hidden="true" />
          {filters.categoria ? (
            <>
              <Link
                href="/store/catalogo"
                className="hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded"
              >
                Catálogo
              </Link>
              <ChevronRight size={12} aria-hidden="true" />
              <span className="text-[#1C1C1E] font-bold">{filters.categoria}</span>
            </>
          ) : (
            <span className="text-[#1C1C1E] font-bold">Catálogo</span>
          )}
        </nav>

        {/* ── Page header ── */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-[#1C1C1E] mb-1">
              {filters.categoria ? filters.categoria : 'Todo el Catálogo'}
            </h1>
            {!loading && (
              <p className="text-sm text-[#8A8A8E]">
                <span className="font-bold text-[#1C1C1E]">{filteredCount}</span>{' '}
                {filteredCount === 1 ? 'producto encontrado' : 'productos encontrados'}
              </p>
            )}
          </div>

          {/* ── Sort dropdown ── */}
          <div className="relative">
            <label htmlFor="catalog-sort" className="sr-only">Ordenar por</label>
            <div className="relative">
              <select
                id="catalog-sort"
                value={filters.ordenar}
                onChange={(e) => setFilter('ordenar', e.target.value)}
                className="appearance-none pl-4 pr-9 py-2.5 border border-[#F0E0EC] rounded-2xl text-sm font-bold text-[#4A4A4A] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#ED87B6] focus:border-transparent transition-all cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A8E]"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>

        {/* ── Search bar ── */}
        <div className="flex gap-2 mb-5">
          <div className="relative flex-1">
            {loading && isSearchActive ? (
              <Loader2
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#ED87B6] animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A8A8E]"
                aria-hidden="true"
              />
            )}
            <label htmlFor="catalog-search" className="sr-only">Buscar productos</label>
            <input
              id="catalog-search"
              type="search"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              placeholder={loading && isSearchActive ? 'Buscando...' : 'Buscar productos...'}
              className="w-full pl-10 pr-10 py-3 border border-[#F0E0EC] rounded-2xl text-sm text-[#1C1C1E] placeholder:text-[#8A8A8E] focus:outline-none focus:ring-2 focus:ring-[#ED87B6] focus:border-transparent bg-white shadow-sm transition-all"
              aria-busy={loading && isSearchActive}
            />
            {filters.search && (
              <button
                onClick={() => clearFilter('search')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A8E] hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded-full p-0.5"
                aria-label="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Mobile filter button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden flex items-center gap-2 px-4 py-3 border-2 border-[#F0E0EC] hover:border-[#ED87B6] text-[#4A4A4A] hover:text-[#ED87B6] font-bold rounded-2xl text-sm transition-all focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none relative"
            aria-label={`Abrir filtros${activeFilterCount > 0 ? ` (${activeFilterCount} activos)` : ''}`}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros
            {activeFilterCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-[#ED87B6] text-white text-[10px] font-black rounded-full flex items-center justify-center px-1"
                aria-hidden="true"
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Active filter chips ── */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5" role="list" aria-label="Filtros activos">
            {chips.map((chip) => (
              <button
                key={chip.key}
                role="listitem"
                onClick={() => clearFilter(chip.key)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF5FA] border border-[#ED87B6] text-[#ED87B6] text-xs font-bold rounded-full hover:bg-[#ED87B6] hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
                aria-label={`Quitar filtro: ${chip.label}`}
              >
                {chip.label}
                <X size={10} aria-hidden="true" />
              </button>
            ))}
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[#8A8A8E] text-xs font-bold rounded-full hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
              aria-label="Limpiar todos los filtros"
            >
              <RefreshCw size={10} aria-hidden="true" />
              Limpiar todo
            </button>
          </div>
        )}

        {/* ── Main content: sidebar + grid ── */}
        <div className="flex gap-8">

          {/* ── Desktop sidebar ── */}
          <aside className="hidden lg:block w-60 flex-shrink-0" aria-label="Filtros de búsqueda">
            <div className="bg-white rounded-2xl border border-[#F0E0EC] p-5 space-y-6 sticky top-24 shadow-sm">

              <div className="flex items-center justify-between">
                <h2 className="font-black text-[#1C1C1E] text-sm uppercase tracking-widest">Filtros</h2>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs font-bold text-[#ED87B6] hover:text-[#E06FA3] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded"
                  >
                    <RefreshCw size={11} aria-hidden="true" />
                    Limpiar
                  </button>
                )}
              </div>

              {/* Categorías */}
              {navNodes.length > 0 && (
                <div>
                  <h3 className="text-xs font-black text-[#4A4A4A] uppercase tracking-widest mb-3">Categoría</h3>
                  <div className="space-y-0.5">
                    <button
                      onClick={() => clearFilter('categoria')}
                      className={`w-full text-left text-sm px-3 py-2 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none ${
                        filters.categoria === ''
                          ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold'
                          : 'text-[#4A4A4A] hover:bg-[#FFF5FA] hover:text-[#ED87B6]'
                      }`}
                    >
                      Todas
                    </button>
                    {navNodes.map((node) => (
                      <div key={node.id}>
                        <button
                          onClick={() => setFilter('categoria', node.label)}
                          className={`w-full text-left text-sm px-3 py-2 rounded-xl font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none ${
                            filters.categoria === node.label
                              ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold'
                              : 'text-[#4A4A4A] hover:bg-[#FFF5FA]'
                          }`}
                        >
                          {node.label}
                        </button>
                        {node.children.map((child) => (
                          <button
                            key={child.id}
                            onClick={() => setFilter('categoria', child.label)}
                            className={`w-full text-left text-xs px-5 py-1.5 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none ${
                              filters.categoria === child.label
                                ? 'text-[#ED87B6] font-bold'
                                : 'text-[#8A8A8E] hover:text-[#ED87B6]'
                            }`}
                          >
                            → {child.label}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Precio */}
              <div>
                <h3 className="text-xs font-black text-[#4A4A4A] uppercase tracking-widest mb-3">Precio (COP)</h3>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={filters.precioMin}
                    onChange={(e) => setFilter('precioMin', e.target.value)}
                    placeholder="Min"
                    aria-label="Precio mínimo"
                    className="w-1/2 py-2 px-3 text-sm border border-[#F0E0EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#ED87B6] focus:border-transparent transition-all"
                  />
                  <input
                    type="number"
                    value={filters.precioMax}
                    onChange={(e) => setFilter('precioMax', e.target.value)}
                    placeholder="Max"
                    aria-label="Precio máximo"
                    className="w-1/2 py-2 px-3 text-sm border border-[#F0E0EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#ED87B6] focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Marcas (derived from products across all pages) */}
              {knownMarcas.length > 0 && (
                <div>
                  <h3 className="text-xs font-black text-[#4A4A4A] uppercase tracking-widest mb-3">Marca</h3>
                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
                    <button
                      onClick={() => clearFilter('marca')}
                      className={`block w-full text-left text-sm px-3 py-2 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none ${
                        filters.marca === ''
                          ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold'
                          : 'text-[#4A4A4A] hover:bg-[#FFF5FA]'
                      }`}
                    >
                      Todas
                    </button>
                    {knownMarcas.map((m) => (
                      <button
                        key={m}
                        onClick={() => setFilter('marca', m)}
                        className={`block w-full text-left text-sm px-3 py-2 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none ${
                          filters.marca === m
                            ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold'
                            : 'text-[#4A4A4A] hover:bg-[#FFF5FA]'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Modalidad */}
              <div>
                <h3 className="text-xs font-black text-[#4A4A4A] uppercase tracking-widest mb-3">Disponibilidad</h3>
                <div className="space-y-0.5">
                  {[
                    { value: '',                  label: 'Todas' },
                    { value: 'ENTREGA_INMEDIATA', label: 'Entrega inmediata' },
                    { value: 'POR_PEDIDO',        label: 'Por pedido' },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setFilter('modalidad', value)}
                      className={`block w-full text-left text-sm px-3 py-2 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none ${
                        filters.modalidad === value
                          ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold'
                          : 'text-[#4A4A4A] hover:bg-[#FFF5FA]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </aside>

          {/* ── Product grid ── */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <ProductGridSkeleton count={12} cols="grid-cols-2 md:grid-cols-3" />
            ) : error ? (
              <ErrorState retry={isRetryable ? retry : undefined} />
            ) : products.length === 0 ? (
              <EmptyState
                title="No encontramos productos con estos filtros"
                description="Prueba con otros criterios o limpia los filtros para ver todo el catálogo."
                action={
                  <button
                    onClick={clearFilters}
                    className="px-6 py-2.5 bg-[#ED87B6] text-white font-bold rounded-full text-sm hover:bg-[#E06FA3] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    Limpiar filtros
                  </button>
                }
              />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6">
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} onAddToCart={addToCart} />
                  ))}
                </div>

                {/* ── Pagination ── */}
                {/* Paginación client-side temporal — ver WEB2A_GAPS_BACKEND.md GAP-001 */}
                {pagination.totalPages > 1 && (
                  <nav
                    className="mt-10 flex items-center justify-center gap-3"
                    aria-label="Paginación del catálogo"
                  >
                    <button
                      onClick={() => setPage(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border-2 border-[#F0E0EC] text-sm font-bold text-[#4A4A4A] hover:border-[#ED87B6] hover:text-[#ED87B6] transition-all focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#F0E0EC] disabled:hover:text-[#4A4A4A]"
                      aria-label="Página anterior"
                    >
                      <ChevronLeft size={16} aria-hidden="true" />
                      Anterior
                    </button>

                    <span
                      className="px-5 py-2.5 rounded-2xl bg-[#FFF5FA] border border-[#F6BAD6] text-sm font-black text-[#ED87B6] select-none"
                      aria-current="page"
                      aria-live="polite"
                    >
                      Página {pagination.page} de {pagination.totalPages}
                    </span>

                    <button
                      onClick={() => setPage(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border-2 border-[#F0E0EC] text-sm font-bold text-[#4A4A4A] hover:border-[#ED87B6] hover:text-[#ED87B6] transition-all focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#F0E0EC] disabled:hover:text-[#4A4A4A]"
                      aria-label="Página siguiente"
                    >
                      Siguiente
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
