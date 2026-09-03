"use client";

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, X, Package, ShoppingCart, SlidersHorizontal } from 'lucide-react';
import { useCart } from '../layout';

const API = 'https://api.nebulaekids.com/api/v1';

const formatCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);

type Product = {
  id: string;
  nombre: string;
  descripcion: string;
  precio_venta: number;
  precio_comparacion?: number;
  descuento_pct?: number;
  imagenes: string[];
  stock_disponible: number;
  categoria: string;
  marca: string;
  sku: string;
};

type Categoria = { nombre: string; sub_categorias: string[] };

function ProductCard({ product }: { product: Product }) {
  const { addToCart } = useCart();
  const img = product.imagenes?.[0] || '';
  const hasDiscount = product.descuento_pct && product.descuento_pct > 0;

  return (
    <div className="group flex flex-col">
      <Link href={`/store/producto/${product.id}`} className="block">
        <div className="relative w-full aspect-[4/5] bg-slate-100 rounded-2xl overflow-hidden mb-3">
          {img ? (
            <img src={img} alt={product.nombre} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <Package size={40} />
            </div>
          )}
          {hasDiscount && (
            <span className="absolute top-3 left-3 bg-rose-500 text-white text-xs font-black px-2 py-1 rounded-lg">
              -{product.descuento_pct}%
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.preventDefault();
                addToCart({ id: product.id, name: product.nombre, price: product.precio_venta, qty: 1, variant: '', img });
              }}
              className="w-full py-2 bg-white/95 text-slate-900 font-bold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors"
            >
              <ShoppingCart size={14} /> Agregar
            </button>
          </div>
        </div>
      </Link>
      <Link href={`/store/producto/${product.id}`}>
        <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1 group-hover:text-emerald-600 transition-colors line-clamp-2">{product.nombre}</h3>
        <div className="flex items-center gap-2">
          <p className="font-black text-slate-900 text-sm">{formatCOP(product.precio_venta)}</p>
          {product.precio_comparacion && product.precio_comparacion > product.precio_venta && (
            <p className="text-xs text-slate-400 line-through">{formatCOP(product.precio_comparacion)}</p>
          )}
        </div>
      </Link>
    </div>
  );
}
export default function CatalogoPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [categoria, setCategoria] = useState('');
  const [marca, setMarca] = useState('');
  const [precioMin, setPrecioMin] = useState('');
  const [precioMax, setPrecioMax] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch(`${API}/ecommerce/categorias`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setCategorias(d);
        else if (Array.isArray(d?.data)) setCategorias(d.data);
      })
      .catch(() => {});
  }, []);

  const loadProducts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ publicado: 'true', limit: '50' });
    if (search) params.append('search', search);
    if (categoria) params.append('categoria', categoria);
    fetch(`${API}/ecommerce/catalogo?${params}`)
      .then((r) => r.json())
      .then((d) => {
        let list: Product[] = Array.isArray(d) ? d : (d?.data || d?.items || []);
        if (marca) list = list.filter((p) => p.marca?.toLowerCase().includes(marca.toLowerCase()));
        if (precioMin) list = list.filter((p) => p.precio_venta >= Number(precioMin));
        if (precioMax) list = list.filter((p) => p.precio_venta <= Number(precioMax));
        setProducts(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [search, categoria, marca, precioMin, precioMax]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const clearFilters = () => {
    setSearch('');
    setSearchInput('');
    setCategoria('');
    setMarca('');
    setPrecioMin('');
    setPrecioMax('');
  };

  const hasFilters = search || categoria || marca || precioMin || precioMax;

  const marcas = [...new Set(products.map((p) => p.marca).filter(Boolean))];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-black text-slate-900">Catálogo</h1>
        <p className="text-slate-500 mt-1">{loading ? 'Cargando...' : `${products.length} productos encontrados`}</p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar Filters */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-6 sticky top-24">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-slate-900 text-sm uppercase tracking-wide">Filtros</h2>
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs font-bold text-rose-500 hover:underline flex items-center gap-1">
                  <X size={12} /> Limpiar
                </button>
              )}
            </div>

            {/* Search */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Buscar</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setSearch(searchInput)}
                  placeholder="Nombre del producto..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <button onClick={() => setSearch(searchInput)} className="mt-2 w-full py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 transition-colors">
                Buscar
              </button>
            </div>

            {/* Categoría */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Categoría</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full py-2 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="">Todas las categorías</option>
                {categorias.map((c) => (
                  <optgroup key={c.nombre} label={c.nombre}>
                    <option value={c.nombre}>{c.nombre}</option>
                    {c.sub_categorias?.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Precio */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Rango de Precio (COP)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={precioMin}
                  onChange={(e) => setPrecioMin(e.target.value)}
                  placeholder="Mín"
                  className="w-1/2 py-2 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="number"
                  value={precioMax}
                  onChange={(e) => setPrecioMax(e.target.value)}
                  placeholder="Máx"
                  className="w-1/2 py-2 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Marca */}
            {marcas.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Marca</label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  <button onClick={() => setMarca('')} className={`block w-full text-left text-sm px-2 py-1 rounded-lg transition-colors ${!marca ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>
                    Todas las marcas
                  </button>
                  {marcas.map((m) => (
                    <button key={m} onClick={() => setMarca(m)} className={`block w-full text-left text-sm px-2 py-1 rounded-lg transition-colors ${marca === m ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile filter button */}
        <div className="lg:hidden w-full mb-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <SlidersHorizontal size={16} /> Filtros
            {hasFilters && <span className="bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-full">activos</span>}
          </button>
        </div>

        {/* Products grid */}
        <div className="flex-1">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="flex flex-col gap-3">
                  <div className="w-full aspect-[4/5] bg-slate-200 rounded-2xl animate-pulse" />
                  <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4" />
                  <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Package size={48} className="mx-auto mb-4 opacity-30" />
              <p className="font-medium">No se encontraron productos.</p>
              {hasFilters && (
                <button onClick={clearFilters} className="mt-4 text-emerald-600 font-bold hover:underline">
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
              {products.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
