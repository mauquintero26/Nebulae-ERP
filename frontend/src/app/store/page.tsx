"use client";

/**
 * Store Home — WEB-1 (rev 2)
 *
 * Changes:
 * - Categorías destacadas ahora vienen de la API (no hardcodeadas)
 * - Textos del hero son reemplazables vía configuración; fallback neutral/general
 * - Barra informativa (info_bar) configurable
 * - Errores manejados con estado visible — no .catch(() => {})
 * - Reintento controlado en caso de falla de red
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, Package, RefreshCw } from 'lucide-react';
import { useCart } from './layout';
import { ProductCard } from '@/components/store/ProductCard';
import { ProductGridSkeleton, EmptyState, ErrorState } from '@/components/store/States';
import type { WebConfig, NavNode } from '@/types/store';
import type { NormalizedProduct } from '@/lib/store-api';
import { listProductos, listCategorias, getSiteConfig, isStoreError } from '@/lib/store-api';


// ── Fallback texts — intentionally general, NOT maternal/bebés ──
const FALLBACK_TITLE   = 'Productos para ti y toda tu familia';
const FALLBACK_SUBTITLE = 'Compra en línea productos por pedido y de entrega inmediata.';
const FALLBACK_CTA     = 'Explorar Catálogo';
const FALLBACK_BADGE   = '✨ Nueva Colección 2026';
const FALLBACK_INFO    = 'Productos seleccionados para toda la familia — Envíos a toda Colombia';

// ── Category card colors (cycling palette) ──
const PALETTE_COLORS = [
  { bg: 'bg-[#F6BAD6]', text: 'text-[#9B2461]' },
  { bg: 'bg-[#B5E1F6]', text: 'text-[#1A5F7A]' },
  { bg: 'bg-[#D1BADB]', text: 'text-[#5B3478]' },
  { bg: 'bg-[#C2D987]', text: 'text-[#3A5A0F]' },
  { bg: 'bg-[#FFEE83]', text: 'text-[#7A6200]' },
  { bg: 'bg-[#F9BF92]', text: 'text-[#8B4500]' },
];

export default function StoreHomePage() {
  const { addToCart } = useCart();

  const [config, setConfig]         = useState<WebConfig>({});
  const [products, setProducts]     = useState<NormalizedProduct[]>([]);
  const [featuredCats, setFeaturedCats] = useState<NavNode[]>([]);
  const [loading, setLoading]       = useState(true);
  const [prodError, setProdError]   = useState(false);
  const [configError, setConfigError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setProdError(false);
    setConfigError(false);

    // Site config — non-fatal: fallbacks in place
    getSiteConfig({ signal: controller.signal })
      .then((cfg) => {
        // Merge BackendWebConfig into WebConfig shape
        setConfig(cfg as unknown as WebConfig);
      })
      .catch((err: unknown) => {
        if (isStoreError(err) && err.isAborted) return;
        console.warn('[Nebulae] Config no disponible:', isStoreError(err) ? err.publicMessage : String(err));
        setConfigError(true);
      });

    // Categories — non-fatal: featured section degrades gracefully
    listCategorias({ signal: controller.signal })
      .then((nodes) => {
        setFeaturedCats(nodes.slice(0, 6));
      })
      .catch((err: unknown) => {
        if (isStoreError(err) && err.isAborted) return;
        console.warn('[Nebulae] Categorías no disponibles:', isStoreError(err) ? err.publicMessage : String(err));
      });

    // Products — primary content, shows error state on failure
    listProductos({ publicado: true, limit: 8 }, { signal: controller.signal })
      .then(({ products: prods }) => {
        setProducts(prods);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (isStoreError(err) && err.isAborted) return;
        console.warn('[Nebulae] Productos no disponibles:', isStoreError(err) ? err.publicMessage : String(err));
        setProdError(true);
        setLoading(false);
      });

    return () => { controller.abort(); };
  }, [retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { return fetchData(); }, [fetchData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Config-derived values with neutral fallbacks ──
  const heroTitle   = config?.hero?.title    ?? FALLBACK_TITLE;
  const heroSub     = config?.hero?.subtitle ?? FALLBACK_SUBTITLE;
  const heroCta     = config?.hero?.cta_text ?? FALLBACK_CTA;
  const heroBg      = config?.hero?.bg_image;
  const badgeText   = config?.hero?.badge_text ?? FALLBACK_BADGE;
  const infoBar     = config?.hero?.info_bar ?? FALLBACK_INFO;

  // ── Featured categories: prefer config override, else use API nodes ──
  const configFeatured = config?.featured_categories;
  const showApiCats = !configFeatured && featuredCats.length > 0;

  return (
    <div>
      {/* ── Info bar ── */}
      {infoBar && (
        <div
          className="w-full bg-[#1C1C1E] text-white text-xs font-bold text-center py-2 px-4 tracking-wide"
          role="note"
          aria-label="Información de envío"
        >
          {infoBar}
        </div>
      )}

      {/* ── Hero ── */}
      <section aria-label="Banner principal" className="relative w-full min-h-[70vh] overflow-hidden">
        {heroBg ? (
          <img src={heroBg} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#F6BAD6] via-[#D1BADB] to-[#B5E1F6]" aria-hidden="true" />
        )}
        <div className="absolute inset-0 bg-white/20" aria-hidden="true" />

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
              href={config?.hero?.cta_href ?? '/store/catalogo'}
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

        {/* ── Categorías destacadas (dinámicas) ── */}
        {(configFeatured || showApiCats) && (
          <section className="mb-16" aria-label="Categorías">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {configFeatured
                ? configFeatured.map(({ slug, label, emoji, href }, i) => {
                    const color = PALETTE_COLORS[i % PALETTE_COLORS.length];
                    return (
                      <Link
                        key={slug}
                        href={href ?? `/store/categoria/${encodeURIComponent(slug)}`}
                        className={`flex flex-col items-center justify-center gap-2 p-4 ${color.bg} rounded-2xl hover:opacity-90 hover:scale-105 transition-all text-center group shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none`}
                      >
                        {emoji && <span className="text-2xl group-hover:scale-110 transition-transform">{emoji}</span>}
                        <span className={`text-xs font-bold ${color.text}`}>{label}</span>
                      </Link>
                    );
                  })
                : featuredCats.map((cat, i) => {
                    const color = PALETTE_COLORS[i % PALETTE_COLORS.length];
                    return (
                      <Link
                        key={cat.id}
                        href={cat.href}
                        className={`flex flex-col items-center justify-center gap-2 p-4 ${color.bg} rounded-2xl hover:opacity-90 hover:scale-105 transition-all text-center group shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none`}
                      >
                        <span className={`text-sm font-bold ${color.text}`}>{cat.label}</span>
                      </Link>
                    );
                  })
              }
            </div>
          </section>
        )}

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
          ) : prodError ? (
            <ErrorState
              title="No pudimos cargar los productos"
              description="Verifica tu conexión o intenta más tarde."
              retry={() => setRetryCount((c) => c + 1)}
            />
          ) : products.length === 0 ? (
            <EmptyState
              icon={<Package size={56} />}
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
        {!configError && (
          <section aria-label="Llamado a acción — registro" className="mt-20">
            <div className="rounded-3xl bg-gradient-to-r from-[#ED87B6] to-[#D1BADB] p-10 sm:p-14 text-center relative overflow-hidden">
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
        )}

      </div>
    </div>
  );
}