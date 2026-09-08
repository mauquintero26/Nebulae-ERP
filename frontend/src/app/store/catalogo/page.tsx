"use client";

/**
 * Catálogo — WEB-1
 *
 * Cambios:
 * - Usa ProductCard unificado (elimina duplicado local)
 * - FilterDrawer móvil (antes el sidebar no renderizaba en móvil)
 * - URL de API normalizada: /ecommerce/catalogo (sin tilde)
 * - Paleta Nebulae
 * - Estado de error y vacío mejorados
 * - Focus visible en todos los controles
 * - Sidebar desktop mejorado con los mismos tokens
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, SlidersHorizontal, X, RefreshCw, ChevronRight } from 'lucide-react';
import { useCart } from '../layout';
import { ProductCard } from '@/components/store/ProductCard';
import { ProductGridSkeleton, EmptyState, ErrorState } from '@/components/store/States';
import { FilterDrawer } from '@/components/store/FilterDrawer';
import type { Product, FilterState, RawCategoria } from '@/types/store';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

const INITIAL_FILTERS: FilterState = {
  search: '', categoria: '', subcategoria: '',
  marca: '', precioMin: '', precioMax: '',
  modalidad: '', disponibilidad: '', talla: '', color: '',
};

export default function CatalogoPage() {
  const { addToCart }      = useCart();
  const [products, setProducts]   = useState<Product[]>([]);
  const [categorias, setCategorias] = useState<RawCategoria[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [filters, setFilters]     = useState<FilterState>(INITIAL_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch categories
  useEffect(() => {
    fetch(`${API}/ecommerce/categorias`)
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : (d?.data ?? []);
        setCategorias(list);
      })
      .catch(() => {});
  }, []);

  // Fetch products on filter change
  const loadProducts = useCallback(() => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ publicado: 'true', limit: '50' });
    if (filters.search)    params.append('search', filters.search);
    if (filters.categoria) params.append('categoria', filters.categoria);

    fetch(`${API}/ecommerce/catalogo?${params}`)
      .then((r) => r.json())
      .then((d) => {
        let list: Product[] = Array.isArray(d) ? d : (d?.data ?? d?.items ?? []);
        // Client-side supplementary filters (WEB-2 will move these server-side)
        if (filters.marca)     list = list.filter((p) => p.marca?.toLowerCase().includes(filters.marca.toLowerCase()));
        if (filters.precioMin) list = list.filter((p) => p.precio_venta >= Number(filters.precioMin));
        if (filters.precioMax) list = list.filter((p) => p.precio_venta <= Number(filters.precioMax));
        if (filters.modalidad) list = list.filter((p) => p.modalidad === filters.modalidad);
        setProducts(list);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, filters.categoria, filters.marca, filters.precioMin, filters.precioMax, filters.modalidad]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(INITIAL_FILTERS);
    setSearchInput('');
  };

  const applySearch = () => handleFilterChange('search', searchInput);

  const hasActiveFilters = Object.entries(filters).some(([, v]) => v !== '');
  const marcas = [...new Set(products.map((p) => p.marca).filter(Boolean))];

  return (
    <>
      {/* Mobile filter drawer */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onChange={handleFilterChange}
        onClear={clearFilters}
        categorias={categorias}
        marcas={marcas}
        hasActiveFilters={hasActiveFilters}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Breadcrumb */}
        <nav aria-label="Ruta de navegación" className="flex items-center gap-1.5 text-xs text-[#8A8A8E] mb-6">
          <Link href="/store" className="hover:text-[#ED87B6] transition-colors">Inicio</Link>
          <ChevronRight size={12} aria-hidden="true" />
          <span className="text-[#1C1C1E] font-bold">Catálogo</span>
        </nav>

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-[#1C1C1E] mb-2">
            {filters.categoria ? filters.categoria : 'Todo el Catálogo'}
          </h1>
          {!loading && (
            <p className="text-sm text-[#8A8A8E]">
              {products.length} {products.length === 1 ? 'producto' : 'productos'}
              {hasActiveFilters && ' encontrados'}
            </p>
          )}
        </div>

        {/* Search bar */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A8A8E]" aria-hidden="true" />
            <label htmlFor="catalog-search" className="sr-only">Buscar productos</label>
            <input
              id="catalog-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
              placeholder="Buscar productos..."
              className="w-full pl-10 pr-4 py-3 border border-[#F0E0EC] rounded-2xl text-sm text-[#1C1C1E] placeholder:text-[#8A8A8E] focus:outline-none focus:ring-2 focus:ring-[#ED87B6] focus:border-transparent bg-white shadow-sm transition-all"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); handleFilterChange('search', ''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A8E] hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded-full p-0.5"
                aria-label="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={applySearch}
            className="px-5 py-3 bg-[#ED87B6] hover:bg-[#E06FA3] text-white font-bold rounded-2xl text-sm transition-all shadow-md shadow-[#ED87B6]/20 focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Buscar
          </button>
          {/* Mobile filter button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden flex items-center gap-2 px-4 py-3 border-2 border-[#F0E0EC] hover:border-[#ED87B6] text-[#4A4A4A] hover:text-[#ED87B6] font-bold rounded-2xl text-sm transition-all focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none relative"
            aria-label="Abrir filtros"
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros
            {hasActiveFilters && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#ED87B6] text-white text-[10px] font-black rounded-full flex items-center justify-center">
                !
              </span>
            )}
          </button>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mb-6" role="list" aria-label="Filtros activos">
            {filters.categoria && (
              <button
                role="listitem"
                onClick={() => handleFilterChange('categoria', '')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF5FA] border border-[#ED87B6] text-[#ED87B6] text-xs font-bold rounded-full hover:bg-[#ED87B6] hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
              >
                {filters.categoria} <X size={10} />
              </button>
            )}
            {filters.search && (
              <button
                role="listitem"
                onClick={() => { handleFilterChange('search', ''); setSearchInput(''); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF5FA] border border-[#ED87B6] text-[#ED87B6] text-xs font-bold rounded-full hover:bg-[#ED87B6] hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
              >
                {`"${filters.search}"`} <X size={10} />
              </button>
            )}
            {filters.marca && (
              <button
                role="listitem"
                onClick={() => handleFilterChange('marca', '')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF5FA] border border-[#ED87B6] text-[#ED87B6] text-xs font-bold rounded-full hover:bg-[#ED87B6] hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
              >
                {filters.marca} <X size={10} />
              </button>
            )}
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[#8A8A8E] text-xs font-bold rounded-full hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
            >
              <RefreshCw size={10} /> Limpiar todo
            </button>
          </div>
        )}

        <div className="flex gap-8">

          {/* ── Desktop sidebar ── */}
          <aside className="hidden lg:block w-60 flex-shrink-0" aria-label="Filtros de búsqueda">
            <div className="bg-white rounded-2xl border border-[#F0E0EC] p-5 space-y-6 sticky top-24 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-black text-[#1C1C1E] text-sm uppercase tracking-widest">Filtros</h2>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-xs font-bold text-[#ED87B6] hover:text-[#E06FA3] flex items-center gap-1 transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded">
                    <RefreshCw size={11} /> Limpiar
                  </button>
                )}
              </div>

              {/* Categorías */}
              {categorias.length > 0 && (
                <div>
                  <h3 className="text-xs font-black text-[#4A4A4A] uppercase tracking-widest mb-3">Categoría</h3>
                  <div className="space-y-0.5">
                    <button
                      onClick={() => handleFilterChange('categoria', '')}
                      className={`w-full text-left text-sm px-3 py-2 rounded-xl transition-colors ${filters.categoria === '' ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold' : 'text-[#4A4A4A] hover:bg-[#FFF5FA] hover:text-[#ED87B6]'}`}
                    >
                      Todas
                    </button>
                    {categorias.map((cat) => (
                      <div key={cat.nombre}>
                        <button
                          onClick={() => handleFilterChange('categoria', cat.nombre)}
                          className={`w-full text-left text-sm px-3 py-2 rounded-xl font-medium transition-colors ${filters.categoria === cat.nombre ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold' : 'text-[#4A4A4A] hover:bg-[#FFF5FA]'}`}
                        >
                          {cat.nombre}
                        </button>
                        {cat.sub_categorias?.map((sub: string) => (
                          <button
                            key={sub}
                            onClick={() => handleFilterChange('categoria', sub)}
                            className={`w-full text-left text-xs px-5 py-1.5 rounded-xl transition-colors ${filters.categoria === sub ? 'text-[#ED87B6] font-bold' : 'text-[#8A8A8E] hover:text-[#ED87B6]'}`}
                          >
                            → {sub}
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
                    onChange={(e) => handleFilterChange('precioMin', e.target.value)}
                    placeholder="Min"
                    aria-label="Precio mínimo"
                    className="w-1/2 py-2 px-3 text-sm border border-[#F0E0EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#ED87B6] focus:border-transparent transition-all"
                  />
                  <input
                    type="number"
                    value={filters.precioMax}
                    onChange={(e) => handleFilterChange('precioMax', e.target.value)}
                    placeholder="Max"
                    aria-label="Precio máximo"
                    className="w-1/2 py-2 px-3 text-sm border border-[#F0E0EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#ED87B6] focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Marcas */}
              {marcas.length > 0 && (
                <div>
                  <h3 className="text-xs font-black text-[#4A4A4A] uppercase tracking-widest mb-3">Marca</h3>
                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
                    <button onClick={() => handleFilterChange('marca', '')} className={`block w-full text-left text-sm px-3 py-2 rounded-xl transition-colors ${filters.marca === '' ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold' : 'text-[#4A4A4A] hover:bg-[#FFF5FA]'}`}>Todas</button>
                    {marcas.map((m) => (
                      <button key={m} onClick={() => handleFilterChange('marca', m)} className={`block w-full text-left text-sm px-3 py-2 rounded-xl transition-colors ${filters.marca === m ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold' : 'text-[#4A4A4A] hover:bg-[#FFF5FA]'}`}>{m}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Modalidad */}
              <div>
                <h3 className="text-xs font-black text-[#4A4A4A] uppercase tracking-widest mb-3">Disponibilidad</h3>
                <div className="space-y-0.5">
                  {[{ value: '', label: 'Todas' }, { value: 'ENTREGA_INMEDIATA', label: 'Entrega inmediata' }, { value: 'POR_PEDIDO', label: 'Por pedido' }].map(({ value, label }) => (
                    <button key={value} onClick={() => handleFilterChange('modalidad', value)} className={`block w-full text-left text-sm px-3 py-2 rounded-xl transition-colors ${filters.modalidad === value ? 'bg-[#FFF5FA] text-[#ED87B6] font-bold' : 'text-[#4A4A4A] hover:bg-[#FFF5FA]'}`}>{label}</button>
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
              <ErrorState retry={loadProducts} />
            ) : products.length === 0 ? (
              <EmptyState
                title="No encontramos productos con estos filtros"
                description="Prueba con otros criterios o limpia los filtros."
                action={
                  <button onClick={clearFilters} className="px-6 py-2.5 bg-[#ED87B6] text-white font-bold rounded-full text-sm hover:bg-[#E06FA3] transition-colors">
                    Limpiar filtros
                  </button>
                }
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} onAddToCart={addToCart} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
