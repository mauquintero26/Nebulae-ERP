"use client";

/**
 * Store Layout — WEB-2A
 *
 * Cambios respecto a WEB-1:
 * - Migrado a store-api (listCategorias, getSiteConfig) — no más raw fetch()
 * - Errores tipados y observables (isStoreError)
 * - formatCOP centralizado en store-api/query
 */

import {
  ShoppingBag, X, Menu, Search, ChevronDown, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import {
  useState, createContext, useContext, useEffect, useRef, useCallback,
} from 'react';
import { StoreLogo }  from '@/components/store/StoreLogo';
import { StoreFooter } from '@/components/store/StoreFooter';
import { NavTreeItem } from '@/components/store/NavTreeItem';
import type { CartItem, CartContextType, NavNode } from '@/types/store';
import { listCategorias, getSiteConfig, formatCOP, isStoreError } from '@/lib/store-api';

// ─── Constants ────────────────────────────────────────────────────────────────

const CART_STORAGE_KEY = 'nebulae_cart_v1';

// ─── Cart Context ─────────────────────────────────────────────────────────────

const CartContext = createContext<CartContextType | null>(null);

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside StoreLayout');
  return ctx;
};

// ─── Cart persistence helpers ─────────────────────────────────────────────────

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage quota exceeded — ignore
  }
}

// ─── Store Layout ─────────────────────────────────────────────────────────────

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  // Cart state (persisted in localStorage)
  const [items, setItems]         = useState<CartItem[]>([]);
  const [isCartOpen, setCartOpen] = useState(false);
  const [hydrated, setHydrated]   = useState(false);

  // Navigation state
  const [navNodes, setNavNodes]         = useState<NavNode[]>([]);
  const [logoUrl, setLogoUrl]           = useState<string | null>(null);
  const [contactInfo, setContactInfo]   = useState<{ phone?: string; whatsapp?: string; email?: string; address?: string }>({});
  const [megaOpen, setMegaOpen]         = useState(false);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const megaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hydrate cart from localStorage (runs once, reading external storage) ──
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setItems(loadCart());
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Persist cart on change ──
  useEffect(() => {
    if (hydrated) saveCart(items);
  }, [items, hydrated]);

  // ── Fetch categories and site config via store-api ──
  useEffect(() => {
    const controller = new AbortController();

    // Categories — non-fatal: nav degrades to empty state
    listCategorias({ signal: controller.signal })
      .then((nodes) => {
        setNavNodes(nodes);
      })
      .catch((err: unknown) => {
        if (isStoreError(err) && err.isAborted) return;
        console.warn('[Nebulae] Categorías no disponibles:', isStoreError(err) ? err.publicMessage : String(err));
      });

    // Site config (logo + contact) — non-fatal: falls back to /logo.png
    getSiteConfig({ signal: controller.signal })
      .then((cfg) => {
        if (cfg?.logo_url) setLogoUrl(cfg.logo_url);
        if (cfg?.contact)  setContactInfo(cfg.contact);
      })
      .catch((err: unknown) => {
        if (isStoreError(err) && err.isAborted) return;
        console.warn('[Nebulae] Config no disponible:', isStoreError(err) ? err.publicMessage : String(err));
      });

    return () => { controller.abort(); };
  }, []);

  // ─── Cart operations ─────────────────────────────────────────────────────────

  const addToCart = useCallback((newItem: CartItem) => {
    setItems((prev) => {
      const key = `${newItem.id}__${newItem.variant}`;
      const exists = prev.find((i) => `${i.id}__${i.variant}` === key);
      const next = exists
        ? prev.map((i) => `${i.id}__${i.variant}` === key ? { ...i, qty: i.qty + newItem.qty } : i)
        : [...prev, newItem];
      return next;
    });
    setCartOpen(true);
  }, []);

  const removeFromCart = useCallback((id: string, variant = '') => {
    setItems((prev) => prev.filter((i) => !(i.id === id && i.variant === variant)));
  }, []);

  const updateQty = useCallback((id: string, variant: string, qty: number) => {
    if (qty < 1) {
      removeFromCart(id, variant);
      return;
    }
    setItems((prev) =>
      prev.map((i) => i.id === id && i.variant === variant ? { ...i, qty } : i)
    );
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const cartTotal = items.reduce((acc, i) => acc + i.price * i.qty, 0);
  const cartCount = items.reduce((acc, i) => acc + i.qty, 0);

  // ─── Mega-menu handlers ───────────────────────────────────────────────────────

  const handleMegaEnter = () => {
    if (megaTimer.current) clearTimeout(megaTimer.current);
    setMegaOpen(true);
  };
  const handleMegaLeave = () => {
    megaTimer.current = setTimeout(() => setMegaOpen(false), 150);
  };

  return (
    <CartContext.Provider value={{
      items, addToCart, removeFromCart, updateQty, clearCart,
      isCartOpen, setCartOpen, cartTotal, cartCount,
    }}>
      <div className="min-h-screen bg-white flex flex-col font-sans">

        {/* ── Top bar ── */}
        <div className="hidden sm:block bg-[#FFF5FA] border-b border-[#F0E0EC] text-xs text-center text-[#8A8A8E] py-1.5 px-4">
          Productos seleccionados para toda la familia — Envíos a toda Colombia
        </div>

        {/* ── Header ── */}
        <header className="bg-white border-b border-[#F0E0EC] sticky top-0 z-40 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

            {/* Left: hamburger + logo */}
            <div className="flex items-center gap-3">
              <button
                className="md:hidden p-2 rounded-lg text-[#8A8A8E] hover:bg-[#FFF5FA] hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav"
              >
                <Menu size={22} />
              </button>
              <StoreLogo logoUrl={logoUrl} />
            </div>

            {/* Center: Desktop nav */}
            <nav className="hidden md:flex items-center gap-0.5 text-sm font-bold text-[#4A4A4A]" aria-label="Navegación principal">
              <Link href="/store" className="px-3 py-2 rounded-xl hover:bg-[#FFF5FA] hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none">
                Inicio
              </Link>

              {/* Catálogo mega-menu */}
              <div
                className="relative"
                onMouseEnter={handleMegaEnter}
                onMouseLeave={handleMegaLeave}
              >
                <button
                  className="flex items-center gap-1 px-3 py-2 rounded-xl hover:bg-[#FFF5FA] hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
                  aria-expanded={megaOpen}
                  aria-haspopup="true"
                  onClick={() => setMegaOpen(!megaOpen)}
                >
                  Catálogo
                  <ChevronDown size={14} className={`transition-transform duration-200 ${megaOpen ? 'rotate-180 text-[#ED87B6]' : ''}`} />
                </button>

                {megaOpen && (
                  <div
                    role="menu"
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-2 min-w-[640px] max-w-[720px] bg-white rounded-2xl shadow-2xl border border-[#F0E0EC] p-6"
                    onMouseEnter={handleMegaEnter}
                    onMouseLeave={handleMegaLeave}
                    style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(navNodes.length, 1), 4)}, 1fr)` }}
                  >
                    {navNodes.length === 0 ? (
                      <Link href="/store/catalogo" className="text-[#ED87B6] font-bold hover:underline">
                        Ver todo el catálogo →
                      </Link>
                    ) : (
                      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.min(navNodes.length, 4)}, 1fr)` }}>
                        {navNodes.map((node) => (
                          <div key={node.id}>
                            {/* NavTreeItem renders the node and all its children recursively */}
                            <NavTreeItem
                              node={node}
                              mode="desktop"
                              depth={0}
                              onNavigate={() => setMegaOpen(false)}
                            />
                          </div>
                        ))}
                        {/* "Ver todo" footer */}
                        <div className="col-span-full mt-2 pt-4 border-t border-[#F0E0EC]">
                          <Link
                            href="/store/catalogo"
                            className="flex items-center gap-2 text-[#ED87B6] font-bold text-sm hover:text-[#E06FA3] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded"
                            onClick={() => setMegaOpen(false)}
                          >
                            Ver todo el catálogo <ArrowRight size={14} />
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Link href="/store/blog" className="px-3 py-2 rounded-xl hover:bg-[#FFF5FA] hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none">
                Blog
              </Link>
              <Link href="/store/contacto" className="px-3 py-2 rounded-xl hover:bg-[#FFF5FA] hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none">
                Contacto
              </Link>
              <Link href="/store/cuenta" className="px-3 py-2 rounded-xl hover:bg-[#FFF5FA] hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none">
                Mi Cuenta
              </Link>
            </nav>

            {/* Right: search + cart */}
            <div className="flex items-center gap-1">
              <Link
                href="/store/catalogo"
                aria-label="Buscar productos"
                className="p-2 rounded-full text-[#8A8A8E] hover:text-[#ED87B6] hover:bg-[#FFF5FA] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
              >
                <Search size={20} />
              </Link>
              <button
                onClick={() => setCartOpen(true)}
                aria-label={`Abrir carrito (${cartCount} ${cartCount === 1 ? 'artículo' : 'artículos'})`}
                className="relative p-2 rounded-full text-[#4A4A4A] hover:text-[#ED87B6] hover:bg-[#FFF5FA] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
              >
                <ShoppingBag size={22} />
                {cartCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-[#ED87B6] text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 border-2 border-white shadow-sm"
                  >
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ── Mobile menu ── */}
          {mobileOpen && (
            <nav
              id="mobile-nav"
              className="md:hidden border-t border-[#F0E0EC] bg-white"
              aria-label="Navegación móvil"
            >
              <div className="max-w-7xl mx-auto px-4 py-3 space-y-0.5">
                <Link href="/store" className="block px-3 py-2.5 font-bold text-[#1C1C1E] hover:text-[#ED87B6] hover:bg-[#FFF5FA] rounded-xl transition-colors" onClick={() => setMobileOpen(false)}>
                  Inicio
                </Link>

                {/* Categorías de navegación — recursivas, desde API */}
                {navNodes.length > 0 && (
                  <div className="border-t border-[#F0E0EC] pt-1">
                    {navNodes.map((node) => (
                      <NavTreeItem
                        key={node.id}
                        node={node}
                        mode="mobile"
                        depth={0}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                )}

                <Link href="/store/blog" className="block px-3 py-2.5 font-bold text-[#1C1C1E] hover:text-[#ED87B6] hover:bg-[#FFF5FA] rounded-xl transition-colors" onClick={() => setMobileOpen(false)}>
                  Blog
                </Link>
                <Link href="/store/contacto" className="block px-3 py-2.5 font-bold text-[#1C1C1E] hover:text-[#ED87B6] hover:bg-[#FFF5FA] rounded-xl transition-colors" onClick={() => setMobileOpen(false)}>
                  Contacto
                </Link>
                <Link href="/store/cuenta" className="block px-3 py-2.5 font-bold text-[#1C1C1E] hover:text-[#ED87B6] hover:bg-[#FFF5FA] rounded-xl transition-colors" onClick={() => setMobileOpen(false)}>
                  Mi Cuenta
                </Link>
              </div>
            </nav>
          )}
        </header>

        {/* ── Main ── */}
        <main id="main-content" className="flex-1 w-full relative z-0" tabIndex={-1}>
          {children}
        </main>

        {/* ── Footer ── */}
        <StoreFooter logoUrl={logoUrl} contactInfo={contactInfo} />

        {/* ── Cart Slide-over ── */}
        {isCartOpen && (
          <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Tu carrito de compras">
            <div
              className="absolute inset-0 bg-[#1C1C1E]/40 backdrop-blur-sm"
              onClick={() => setCartOpen(false)}
              aria-hidden="true"
            />
            <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col">

              {/* Cart header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0E0EC]">
                <h2 className="text-lg font-black text-[#1C1C1E]">
                  Tu Carrito
                  {cartCount > 0 && (
                    <span className="ml-2 text-sm font-bold text-[#8A8A8E]">({cartCount})</span>
                  )}
                </h2>
                <button
                  onClick={() => setCartOpen(false)}
                  aria-label="Cerrar carrito"
                  className="p-2 hover:bg-[#FFF5FA] rounded-full text-[#8A8A8E] hover:text-[#ED87B6] transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Cart items */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {items.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                    <div className="w-20 h-20 bg-[#FFF5FA] rounded-full flex items-center justify-center">
                      <ShoppingBag size={36} className="text-[#F6BAD6]" aria-hidden="true" />
                    </div>
                    <p className="font-bold text-[#4A4A4A]">Tu carrito está vacío</p>
                    <button
                      onClick={() => setCartOpen(false)}
                      className="text-sm text-[#ED87B6] font-bold hover:underline focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded"
                    >
                      Explorar productos
                    </button>
                  </div>
                ) : (
                  items.map((item) => (
                    <div key={`${item.id}__${item.variant}`} className="flex gap-3 pb-4 border-b border-[#F0E0EC] last:border-0">
                      {/* Product image */}
                      <div className="w-20 h-24 bg-[#FFF5FA] rounded-xl overflow-hidden flex-shrink-0">
                        {item.img ? (
                          <img src={item.img} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#F6BAD6]">
                            <ShoppingBag size={20} />
                          </div>
                        )}
                      </div>

                      {/* Product info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-[#1C1C1E] text-sm leading-tight line-clamp-2">{item.name}</h4>
                        {item.variant && <p className="text-xs text-[#8A8A8E] mt-0.5">{item.variant}</p>}
                        <p className="font-black text-[#1C1C1E] text-sm mt-1.5">{formatCOP(item.price)}</p>

                        {/* Quantity + remove */}
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center border border-[#F0E0EC] rounded-xl overflow-hidden">
                            <button
                              onClick={() => updateQty(item.id, item.variant, item.qty - 1)}
                              aria-label={`Reducir cantidad de ${item.name}`}
                              className="px-2.5 py-1 text-[#4A4A4A] hover:bg-[#FFF5FA] hover:text-[#ED87B6] transition-colors text-base font-bold focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
                            >
                              −
                            </button>
                            <span className="px-3 py-1 text-sm font-bold text-[#1C1C1E] border-x border-[#F0E0EC]">{item.qty}</span>
                            <button
                              onClick={() => updateQty(item.id, item.variant, item.qty + 1)}
                              aria-label={`Aumentar cantidad de ${item.name}`}
                              className="px-2.5 py-1 text-[#4A4A4A] hover:bg-[#FFF5FA] hover:text-[#ED87B6] transition-colors text-base font-bold focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none"
                            >
                              +
                            </button>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.id, item.variant)}
                            className="text-xs font-bold text-[#E55B8A] hover:text-[#C44A77] hover:underline transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded"
                            aria-label={`Eliminar ${item.name} del carrito`}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Cart footer */}
              {items.length > 0 && (
                <div className="px-6 py-4 border-t border-[#F0E0EC] bg-[#FFF5FA]">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-bold text-[#4A4A4A]">Subtotal</span>
                    <span className="font-black text-xl text-[#1C1C1E]">{formatCOP(cartTotal)}</span>
                  </div>
                  <Link
                    href="/store/checkout"
                    onClick={() => setCartOpen(false)}
                    className="w-full py-3.5 bg-[#ED87B6] hover:bg-[#E06FA3] text-white rounded-2xl font-bold text-center block transition-all shadow-md shadow-[#ED87B6]/30 focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    Ir al Checkout →
                  </Link>
                  <button
                    onClick={() => setCartOpen(false)}
                    className="w-full mt-2 py-2 text-sm text-[#8A8A8E] hover:text-[#ED87B6] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded"
                  >
                    Continuar comprando
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </CartContext.Provider>
  );
}