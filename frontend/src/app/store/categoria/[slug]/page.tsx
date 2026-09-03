"use client";

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { use } from 'react';
import { Search, X, Package, ShoppingCart, ChevronRight } from 'lucide-react';
import { useCart } from '../../layout';

const API = 'https://api.nebulaekids.com/api/v1';

const formatCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);

type Product = {
  id: string; nombre: string; descripcion: string; precio_venta: number;
  precio_comparacion?: number; descuento_pct?: number; imagenes: string[];
  stock_disponible: number; categoria: string; marca: string; sku: string;
};

function ProductCard({ product }: { product: Product }) {
  const { addToCart } = useCart();
  const img = product.imagenes?.[0] || '';
  const hasDiscount = product.descuento_pct && product.descuento_pct > 0;
  return (
    <div className="group flex flex-col">
      <Link href={"/store/producto/"+product.id} className="block">
        <div className="relative w-full aspect-[4/5] bg-slate-100 rounded-2xl overflow-hidden mb-3">
          {img ? (
            <img src={img} alt={product.nombre} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300"><Package size={40} /></div>
          )}
          {hasDiscount && (
            <span className="absolute top-3 left-3 bg-rose-500 text-white text-xs font-black px-2 py-1 rounded-lg">-{product.descuento_pct}%</span>
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
      <Link href={"/store/producto/"+product.id}>
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

export default function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const categoryName = decodeURIComponent(slug);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [marca, setMarca] = useState('');
  const [precioMin, setPrecioMin] = useState('');
  const [precioMax, setPrecioMax] = useState('');

  const loadProducts = useCallback(() => {
    setLoading(true);
    const qp = new URLSearchParams({ publicado: 'true', limit: '50', categoria: categoryName });
    if (search) qp.append('search', search);
    fetch(API+'/ecommerce/catalogo?'+qp)
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
  }, [categoryName, search, marca, precioMin, precioMax]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const clearFilters = () => { setSearch(''); setSearchInput(''); setMarca(''); setPrecioMin(''); setPrecioMax(''); };
  const hasFilters = search || marca || precioMin || precioMax;
  const marcas = [...new Set(products.map((p) => p.marca).filter(Boolean))];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="relative w-full h-48 rounded-3xl overflow-hidden bg-gradient-to-r from-emerald-600 to-teal-500 mb-8 mt-6 flex items-center px-12">
        <div>
          <nav className="flex items-center gap-2 text-emerald-100 text-xs font-medium mb-3">
            <Link href="/store" className="hover:text-white transition-colors">Inicio</Link>
            <ChevronRight size={12} />
            <Link href="/store/catalogo" className="hover:text-white transition-colors">Catalogo</Link>
            <ChevronRight size={12} />
            <span className="text-white font-bold">{categoryName}</span>
          </nav>
          <h1 className="text-3xl font-black text-white">{categoryName}</h1>
          <p className="text-emerald-100 mt-1">{loading ? 'Cargando...' : products.length+' productos'}</p>
        </div>
      </div>
      <div className="flex gap-8 pb-12">
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-6 sticky top-24">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-slate-900 text-sm uppercase tracking-wide">Filtros</h2>
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs font-bold text-rose-500 hover:underline flex items-center gap-1"><X size={12} /> Limpiar</button>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Buscar</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setSearch(searchInput)} placeholder="Nombre..." className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <button onClick={() => setSearch(searchInput)} className="mt-2 w-full py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 transition-colors">Buscar</button>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Precio (COP)</label>
              <div className="flex gap-2">
                <input type="number" value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} placeholder="Min" className="w-1/2 py-2 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <input type="number" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} placeholder="Max" className="w-1/2 py-2 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            {marcas.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Marca</label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  <button onClick={() => setMarca('')} className="block w-full text-left text-sm px-2 py-1 rounded-lg transition-colors text-slate-600 hover:bg-slate-50">Todas</button>
                  {marcas.map((m) => (
                    <button key={m} onClick={() => setMarca(m)} className="block w-full text-left text-sm px-2 py-1 rounded-lg transition-colors text-slate-600 hover:bg-slate-50">{m}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
        <div className="flex-1">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6">
              {[...Array(9)].map((_, i) => (
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
              <p className="font-medium">No hay productos en esta categoria.</p>
              <Link href="/store/catalogo" className="mt-4 inline-block text-emerald-600 font-bold hover:underline">Ver todo el catalogo</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6">
              {products.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

