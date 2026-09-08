"use client";

/**
 * Store Home — WEB-1
 *
 * Cambios respecto a la versión anterior:
 * - Usa ProductCard unificado
 * - URL de API normalizada: /ecommerce/catalogo (sin tilde ni mayúscula)
 * - Hero muestra logo real, paleta Nebulae pastel
 * - Footer eliminado (ahora en StoreLayout)
 * - Colores actualizados a paleta Nebulae
 * - Skeleton mejorado
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, Package } from 'lucide-react';
import { useCart } from './layout';
import { ProductCard } from '@/components/store/ProductCard';
import { ProductGridSkeleton, EmptyState } from '@/components/store/States';
import type { Product, WebConfig } from '@/types/store';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

export default function StoreHomePage() {
  const { addToCart } = useCart();
  const [config, setConfig]   = useState<WebConfig>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/ecommerce/web-builder/config`).then((r) => r.json()).catch(() => ({})),
      fetch(`${API}/ecommerce/catalogo?publicado=true&limit=8`).then((r) => r.json()).catch(() => null),
    ]).then(([cfg, prods]) => {
      const data = cfg?.data ?? cfg;
      setConfig(data || {});
      if (prods === null) {
        setError(true);
      } else {
        const list = Array.isArray(prods) ? prods : (prods?.data ?? prods?.items ?? []);
        setProducts(list);
      }
      setLoading(false);
    });
  }, []);

  const logoUrl     = config?.logo_url;
  const heroTitle   = config?.hero?.title    ?? 'Comodidad que se adapta a ti.';
  const heroSub     = config?.hero?.subtitle ?? 'Ropa maternal y para bebé con diseño y calidad.';
  const heroCta     = config?.hero?.cta_text ?? 'Explorar Colección';
  const heroBg      = config?.hero?.bg_image;
  const badgeText   = config?.hero?.badge_text ?? '✨ Nueva Colección 2026';

  return (
    <div>
      {/* ── Hero ── */}
      <section aria-label="Banner principal" className="relative w-full min-h-[70vh] overflow-hidden">
        {/* Background */}
        {heroBg ? (
          <img src={heroBg} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#F6BAD6] via-[#D1BADB] to-[#B5E1F6]" aria-hidden="true" />
        )}
        {/* Overlay */}
        <div className="absolute inset-0 bg-white/20" aria-hidden="true" />

        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full min-h-[70vh] flex flex-col items-start justify-center py-20">
          {badgeText && (
            <span className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm text-[#ED87B6] font-black text-xs tracking-wider px-4 py-2 rounded-full mb-6 shadow-sm">
              <Sparkles size={12} aria-hidden="true" />
              {badgeText}
            </span>
          )}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#1C1C1E] mb-4 max-w-2xl leading-tight">
            {heroTitle}
          </h1>
          <p className="text-lg text-[#4A4A4A] mb-8 max-w-xl leading-relaxed">
            {heroSub}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/store/catalogo"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#ED87B6] text-white rounded-full font-bold hover:bg-[#E06FA3] transition-all hover:scale-105 shadow-lg shadow-[#ED87B6]/30 focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {heroCta} <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              href="/store/contacto"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white/80 backdrop-blur-sm text-[#1C1C1E] rounded-full font-bold hover:bg-white transition-all shadow-sm focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Contactar
            </Link>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        {/* ── Categorías rápidas ── */}
        <section className="mb-16" aria-label="Categorías">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { emoji: '👶', label: 'Bebés',    href: '/store/categoria/Bebe' },
              { emoji: '👗', label: 'Ropa',     href: '/store/categoria/Ropa' },
              { emoji: '👟', label: 'Calzado',  href: '/store/categoria/Calzado' },
              { emoji: '🧸', label: 'Juguetes', href: '/store/categoria/Juguetes' },
              { emoji: '💚', label: 'Bienestar',href: '/store/categoria/Bienestar' },
              { emoji: '🏷️', label: 'Ofertas',  href: '/store/catalogo' },
            ].map(({ emoji, label, href }) => (
              <Link
                key={label}
                href={href}
                className="flex flex-col items-center justify-center gap-2 p-4 bg-white rounded-2xl border border-[#F0E0EC] hover:border-[#ED87B6] hover:bg-[#FFF5FA] transition-all text-center group shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
              >
                <span className="text-2xl group-hover:scale-110 transition-transform">{emoji}</span>
                <span className="text-xs font-bold text-[#4A4A4A] group-hover:text-[#ED87B6] transition-colors">{label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Productos destacados ── */}
        <section aria-label="Productos recién llegados">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black text-[#1C1C1E]">Recién Llegados</h2>
            <Link
              href="/store/catalogo"
              className="text-sm font-bold text-[#ED87B6] hover:text-[#E06FA3] flex items-center gap-1 transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded"
            >
              Ver todos <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {loading ? (
            <ProductGridSkeleton count={8} />
          ) : error ? (
            <EmptyState
              icon={<Package size={56} />}
              title="No pudimos cargar los productos"
              description="Verifica tu conexión o intenta más tarde."
              action={
                <Link href="/store/catalogo" className="px-6 py-2.5 bg-[#ED87B6] text-white font-bold rounded-full text-sm hover:bg-[#E06FA3] transition-colors">
                  Ver catálogo
                </Link>
              }
            />
          ) : products.length === 0 ? (
            <EmptyState
              title="No hay productos disponibles todavía"
              description="Vuelve pronto — estamos preparando nuestra colección."
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onAddToCart={addToCart} />
              ))}
            </div>
          )}
        </section>

        {/* ── CTA Banner ── */}
        <section aria-label="Llamado a acción — registro" className="mt-20">
          <div className="rounded-3xl bg-gradient-to-r from-[#ED87B6] to-[#D1BADB] p-10 sm:p-14 text-center relative overflow-hidden">
            {/* Decorative circles */}
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" aria-hidden="true" />
            <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/10 rounded-full" aria-hidden="true" />
            <div className="relative">
              <span className="text-3xl mb-4 block" aria-hidden="true">⭐</span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">
                ¿Primera vez con nosotros?
              </h2>
              <p className="text-white/80 mb-6 max-w-md mx-auto text-sm sm:text-base">
                Crea tu cuenta y disfruta de acceso anticipado a colecciones exclusivas.
              </p>
              <Link
                href="/store/cuenta"
                className="inline-flex items-center gap-2 px-8 py-3 bg-white text-[#ED87B6] rounded-full font-bold hover:bg-[#FFF5FA] transition-colors shadow-lg focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#ED87B6] focus-visible:outline-none"
              >
                Crear Cuenta <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}