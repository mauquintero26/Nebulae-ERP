"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, ArrowRight, Star, Package } from 'lucide-react';
import { useCart } from './layout';

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

type WebConfig = {
  hero?: { title?: string; subtitle?: string; cta_text?: string };
  contact?: { phone?: string; email?: string; address?: string };
};

function ProductCard({ product }: { product: Product }) {
  const { addToCart } = useCart();
  const [hovered, setHovered] = useState(false);
  const img = product.imagenes?.[0] || '';
  const hasDiscount = product.descuento_pct && product.descuento_pct > 0;

  return (
    <div
      className="group flex flex-col cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link href={`/store/producto/${product.id}`} className="block">
        <div className="relative w-full aspect-[4/5] bg-slate-100 rounded-2xl overflow-hidden mb-4">
          {img ? (
            <img
              src={img}
              alt={product.nombre}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <Package size={48} />
            </div>
          )}
          {hasDiscount && (
            <span className="absolute top-3 left-3 bg-rose-500 text-white text-xs font-black px-2 py-1 rounded-lg">
              -{product.descuento_pct}%
            </span>
          )}
          {hovered && (
            <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  addToCart({
                    id: product.id,
                    name: product.nombre,
                    price: product.precio_venta,
                    qty: 1,
                    variant: '',
                    img,
                  });
                }}
                className="w-full py-2 bg-white/95 backdrop-blur-sm text-slate-900 font-bold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors"
              >
                <ShoppingCart size={16} /> Agregar al Carrito
              </button>
            </div>
          )}
        </div>
      </Link>
      <Link href={`/store/producto/${product.id}`}>
        <h3 className="font-bold text-slate-800 leading-tight mb-1 group-hover:text-emerald-600 transition-colors line-clamp-2">
          {product.nombre}
        </h3>
        <div className="flex items-center gap-2">
          <p className="font-black text-slate-900">{formatCOP(product.precio_venta)}</p>
          {product.precio_comparacion && product.precio_comparacion > product.precio_venta && (
            <p className="text-sm text-slate-400 line-through">{formatCOP(product.precio_comparacion)}</p>
          )}
        </div>
      </Link>
    </div>
  );
}

export default function StoreHomePage() {
  const [config, setConfig] = useState<WebConfig>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/ecommerce/web-builder/config`).then((r) => r.json()).catch(() => ({})),
      fetch(`${API}/ecommerce/Catálogo?publicado=true&limit=8`).then((r) => r.json()).catch(() => []),
    ]).then(([cfg, prods]) => {
      setConfig(cfg || {});
      const list = Array.isArray(prods) ? prods : (prods?.data || prods?.items || []);
      setProducts(list);
      setLoading(false);
    });
  }, []);

  const heroTitle = config?.hero?.title || 'Comodidad que se adapta a ti.';
  const heroSubtitle = config?.hero?.subtitle || 'Ropa maternal y para bebé con diseño y calidad.';
  const heroCta = config?.hero?.cta_text || 'Explorar Colección';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

      {/* Hero Banner */}
      <div className="relative w-full h-[60vh] min-h-[400px] rounded-3xl overflow-hidden bg-slate-900 mb-16 shadow-2xl">
        <img
          src="https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&q=80&w=1600"
          alt="Hero"
          className="absolute inset-0 w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 to-slate-900/20" />
        <div className="absolute inset-0 flex flex-col items-start justify-center p-12">
          <span className="text-emerald-400 font-black tracking-widest uppercase text-sm mb-4">Nueva Colección 2026</span>
          <h1 className="text-4xl md:text-6xl font-black text-white mb-4 max-w-2xl leading-tight">
            {heroTitle}
          </h1>
          <p className="text-slate-300 text-lg mb-8 max-w-xl">{heroSubtitle}</p>
          <Link
            href="/store/Catálogo"
            className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-500 text-white rounded-full font-bold hover:bg-emerald-600 transition-all hover:scale-105 shadow-lg shadow-emerald-500/30"
          >
            {heroCta} <ArrowRight size={18} />
          </Link>
        </div>
      </div>

      {/* Products Section */}
      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-900">Recién Llegados</h2>
        <Link href="/store/Catálogo" className="text-sm font-bold text-emerald-600 hover:underline flex items-center gap-1">
          Ver todos <ArrowRight size={14} />
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex flex-col gap-4">
              <div className="w-full aspect-[4/5] bg-slate-200 rounded-2xl animate-pulse" />
              <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Package size={48} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">No hay productos disponibles por ahora.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8">
          {products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}

      {/* Banner CTA */}
      <div className="mt-20 rounded-3xl bg-emerald-600 p-12 text-center text-white">
        <Star size={32} className="mx-auto mb-4 opacity-80" />
        <h2 className="text-3xl font-black mb-3">¿Primera vez con nosotros?</h2>
        <p className="text-emerald-100 mb-6 max-w-md mx-auto">Crea tu cuenta y disfruta de envíos especiales y acceso a colecciones exclusivas.</p>
        <Link
          href="/store/cuenta"
          className="inline-flex items-center gap-2 px-8 py-3 bg-white text-emerald-700 rounded-full font-bold hover:bg-emerald-50 transition-colors"
        >
          Crear Cuenta <ArrowRight size={16} />
        </Link>
      </div>

      {/* Footer */}
      <footer className="mt-20 pt-10 border-t border-slate-200 text-center">
        <Link href="/store" className="text-xl font-black tracking-tighter text-slate-900 mb-6 block">
          NEBULAE<span className="text-emerald-500">.</span>
        </Link>
        <nav className="flex flex-wrap justify-center gap-6 text-sm font-bold text-slate-500 mb-6">
          <Link href="/store" className="hover:text-emerald-600 transition-colors">Inicio</Link>
          <Link href="/store/Catálogo" className="hover:text-emerald-600 transition-colors">Catálogo</Link>
          <Link href="/store/blog" className="hover:text-emerald-600 transition-colors">Blog</Link>
          <Link href="/store/contacto" className="hover:text-emerald-600 transition-colors">Contacto</Link>
          <Link href="/store/cuenta" className="hover:text-emerald-600 transition-colors">Mi Cuenta</Link>
        </nav>
        <p className="text-xs text-slate-400">© 2026 Nebulae Kids. Todos los derechos reservados.</p>
      </footer>

    </div>
  );
}