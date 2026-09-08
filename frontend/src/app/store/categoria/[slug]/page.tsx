"use client";

/**
 * Categoría — WEB-1
 *
 * Cambios:
 * - Usa ProductCard unificado (elimina duplicado local)
 * - Paleta Nebulae (elimina emerald)
 * - Drawer de filtros móvil
 * - Estado de error y vacío mejorados
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { use } from 'react';
import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useCart } from '../../layout';
import { ProductCard } from '@/components/store/ProductCard';
import { ProductGridSkeleton, EmptyState, ErrorState } from '@/components/store/States';
import { FilterDrawer } from '@/components/store/FilterDrawer';
import type { Product, FilterState } from '@/types/store';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

const INITIAL_FILTERS: FilterState = {
  search: '', categoria: '', subcategoria: '',
  marca: '', precioMin: '', precioMax: '',
  modalidad: '', disponibilidad: '', talla: '', color: '',
};

export default function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug }       = use(params);
  const categoryName   = decodeURIComponent(slug);
  const { addToCart }  = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [filters, setFilters]   = useState<FilterState>({ ...INITIAL_FILTERS, categoria: categoryName });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadProducts = useCallback(() => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ publicado: 'true', limit: '50', categoria: categoryName });
    if (filters.search) params.append('search', filters.search);

    fetch(`${API}/ecommerce/catalogo?${params}`)
      .then((r) => r.json())
      .then((d) => {
        let list: Product[] = Array.isArray(d) ? d : (d?.data ?? d?.items ?? []);
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
  }, [categoryName, filters.search, filters.marca, filters.precioMin, filters.precioMax, filters.modalidad]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ ...INITIAL_FILTERS, categoria: categoryName });
  };

  const hasActiveFilters =
    filters.search || filters.marca || filters.precioMin || filters.precioMax || filters.modalidad;
  const marcas = [...new Set(products.map((p) => p.marca).filter(Boolean))];

  return (
    <>
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onChange={handleFilterChange}
        onClear={clearFilters}
        marcas={marcas}
        hasActiveFilters={!!hasActiveFilters}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Category hero */}
        <div className="relative w-full rounded-3xl overflow-hidden bg-gradient-to-r from-[#ED87B6] to-[#D1BADB] mb-8 mt-6 px-8 py-10">
          <nav aria-label="Ruta de navegación" className="flex items-center gap-1.5 text-[#fff]/70 text-xs font-medium mb-3">
            <Link href="/store" className="hover:text-white transition-colors">Inicio</Link>
            <ChevronRight size={12} aria-hidden="true" />
            <Link href="/store/catalogo" className="hover:text-white transition-colors">Catálogo</Link>
            <ChevronRight size={12} aria-hidden="true" />
            <span className="text-white font-bold">{categoryName}</span>
          </nav>
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-black text-white">{categoryName}</h1>
              <p className="text-white/80 mt-1 text-sm">
                {loading ? 'Cargando...' : `${products.length} producto${products.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm text-white font-bold rounded-full text-sm hover:bg-white/30 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              Filtros
              {hasActiveFilters && (
                <span className="w-4 h-4 bg-[#FFEE83] text-[#1C1C1E] text-[10px] font-black rounded-full flex items-center justify-center">!</span>
              )}
            </button>
          </div>
        </div>

        {/* Products */}
        <div className="pb-12">
          {loading ? (
            <ProductGridSkeleton count={9} cols="grid-cols-2 md:grid-cols-3" />
          ) : error ? (
            <ErrorState retry={loadProducts} />
          ) : products.length === 0 ? (
            <EmptyState
              title={`No hay productos en "${categoryName}"`}
              description="Puede que esta categoría aún no tenga productos publicados."
              action={
                <Link href="/store/catalogo" className="px-6 py-2.5 bg-[#ED87B6] text-white font-bold rounded-full text-sm hover:bg-[#E06FA3] transition-colors">
                  Ver todo el catálogo
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onAddToCart={addToCart} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
