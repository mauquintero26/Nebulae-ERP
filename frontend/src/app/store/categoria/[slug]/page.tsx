"use client";

/**
 * Categoría — WEB-2A
 *
 * Migrado a useCatalog hook desde store-api.
 * Usa la misma arquitectura que /store/catalogo pero con categoria pre-fijada desde el slug.
 */

import { use } from 'react';
import Link from 'next/link';
import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '../../layout';
import { ProductCard } from '@/components/store/ProductCard';
import { ProductGridSkeleton, EmptyState, ErrorState } from '@/components/store/States';
import { FilterDrawer } from '@/components/store/FilterDrawer';
import { useCatalog } from '@/hooks/useCatalog';
import type { FilterState } from '@/types/store';

export default function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug }       = use(params);
  const categoryName   = decodeURIComponent(slug);
  const { addToCart }  = useCart();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
  } = useCatalog({ initialCategoria: categoryName });

  // Adapt CatalogFilterState to FilterState for FilterDrawer (mobile)
  const drawerFilters: FilterState = {
    search:       filters.search,
    categoria:    filters.categoria,
    subcategoria: filters.subcategoria,
    marca:        filters.marca,
    precioMin:    filters.precioMin,
    precioMax:    filters.precioMax,
    modalidad:    filters.modalidad,
    disponibilidad: filters.disponibilidad,
    talla:        filters.talla,
    color:        filters.color,
  };

  const handleDrawerChange = (key: keyof FilterState, value: string) => {
    setFilter(key as keyof typeof filters, value);
  };

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <>
      {/* Mobile filter drawer */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={drawerFilters}
        onChange={handleDrawerChange}
        onClear={clearFilters}
        categorias={[]}
        marcas={[]}
        hasActiveFilters={hasActiveFilters}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Breadcrumb */}
        <nav aria-label="Ruta de navegación" className="flex items-center gap-1.5 text-xs text-[#8A8A8E] mb-6 flex-wrap">
          <Link href="/store" className="hover:text-[#ED87B6] transition-colors">Inicio</Link>
          <ChevronRight size={12} aria-hidden="true" />
          <Link href="/store/catalogo" className="hover:text-[#ED87B6] transition-colors">Catálogo</Link>
          <ChevronRight size={12} aria-hidden="true" />
          <span className="text-[#1C1C1E] font-bold truncate max-w-[200px]">{categoryName}</span>
        </nav>

        {/* Page header */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#1C1C1E] mb-1">{categoryName}</h1>
            {!loading && (
              <p className="text-sm text-[#8A8A8E]">
                {filteredCount} {filteredCount === 1 ? 'producto' : 'productos'}
              </p>
            )}
          </div>

          {/* Mobile filter button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden flex items-center gap-2 px-4 py-2.5 border-2 border-[#F0E0EC] hover:border-[#ED87B6] text-[#4A4A4A] hover:text-[#ED87B6] font-bold rounded-2xl text-sm transition-all focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none relative"
            aria-label={`Filtros${activeFilterCount > 0 ? ` (${activeFilterCount} activos)` : ''}`}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#ED87B6] text-white text-[10px] font-black rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && filters.search && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => clearFilter('search')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF5FA] border border-[#ED87B6] text-[#ED87B6] text-xs font-bold rounded-full hover:bg-[#ED87B6] hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
            >
              &ldquo;{filters.search}&rdquo; <span aria-hidden="true">×</span>
            </button>
            <button
              onClick={clearFilters}
              className="text-[#8A8A8E] text-xs font-bold hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded px-2"
            >
              Limpiar todo
            </button>
          </div>
        )}

        {/* Product grid */}
        {loading ? (
          <ProductGridSkeleton count={12} cols="grid-cols-2 md:grid-cols-3 lg:grid-cols-4" />
        ) : error ? (
          <ErrorState retry={isRetryable ? retry : undefined} />
        ) : products.length === 0 ? (
          <EmptyState
            title="No hay productos en esta categoría"
            description="Prueba con otros filtros o explora el catálogo completo."
            action={
              <Link
                href="/store/catalogo"
                className="px-6 py-2.5 bg-[#ED87B6] text-white font-bold rounded-full text-sm hover:bg-[#E06FA3] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Ver catálogo completo
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onAddToCart={addToCart} />
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-10">
                <button
                  onClick={() => setPage(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-4 py-2 rounded-xl border-2 border-[#F0E0EC] text-sm font-bold text-[#4A4A4A] hover:border-[#ED87B6] hover:text-[#ED87B6] transition-all disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
                  aria-label="Página anterior"
                >
                  ← Anterior
                </button>
                <span className="text-sm text-[#8A8A8E] font-medium">
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-4 py-2 rounded-xl border-2 border-[#F0E0EC] text-sm font-bold text-[#4A4A4A] hover:border-[#ED87B6] hover:text-[#ED87B6] transition-all disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
                  aria-label="Página siguiente"
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
