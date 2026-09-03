"use client";

import { ShoppingBag, X, Menu, Search, ChevronDown, Phone, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState, createContext, useContext, useEffect, useRef } from 'react';

// --- Types ---
type CartItem = { id: string; name: string; price: number; qty: number; variant: string; img: string };
type CartContextType = {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: string) => void;
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  cartTotal: number;
};
type Categoria = { nombre: string; sub_categorias: string[] };

// --- Cart Context ---
const CartContext = createContext<CartContextType | null>(null);
export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};

const API = 'https://api.nebulaekids.com/api/v1';

const formatCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);

// --- Store Layout ---
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setCartOpen] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [megaMenuOpen, setMegaMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const megaRef = useRef<HTMLDivElement>(null);
  const megaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`${API}/ecommerce/categorias`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCategorias(data);
        else if (Array.isArray(data?.data)) setCategorias(data.data);
      })
      .catch(() => {});
  }, []);

  const addToCart = (newItem: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === newItem.id && i.variant === newItem.variant);
      if (existing) return prev.map((i) => i.id === newItem.id ? { ...i, qty: i.qty + newItem.qty } : i);
      return [...prev, newItem];
    });
    setCartOpen(true);
  };

  const removeFromCart = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const cartTotal = items.reduce((acc, i) => acc + (i.price * i.qty), 0);
  const cartCount = items.reduce((acc, i) => acc + i.qty, 0);

  const handleMegaEnter = () => {
    if (megaTimerRef.current) clearTimeout(megaTimerRef.current);
    setMegaMenuOpen(true);
  };
  const handleMegaLeave = () => {
    megaTimerRef.current = setTimeout(() => setMegaMenuOpen(false), 150);
  };

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, isCartOpen, setCartOpen, cartTotal }}>
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">

        {/* Navbar */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

            <div className="flex items-center gap-4">
              <button
                className="md:hidden text-slate-500 hover:text-slate-800"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <Menu size={24} />
              </button>
              <Link href="/store" className="text-2xl font-black tracking-tighter text-slate-900">
                NEBULAE<span className="text-emerald-500">.</span>
              </Link>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1 font-bold text-sm text-slate-600">
              <Link href="/store" className="px-3 py-2 rounded-lg hover:bg-slate-100 hover:text-emerald-600 transition-colors">
                Inicio
              </Link>

              {/* Catálogo with mega-menu */}
              <div className="relative" onMouseEnter={handleMegaEnter} onMouseLeave={handleMegaLeave} ref={megaRef}>
                <button className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-slate-100 hover:text-emerald-600 transition-colors">
                  Catálogo <ChevronDown size={14} className={`transition-transform ${megaMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {megaMenuOpen && (
                  <div
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-[680px] bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 grid gap-6"
                    style={{ gridTemplateColumns: `repeat(${Math.min(categorias.length || 1, 4)}, 1fr)` }}
                    onMouseEnter={handleMegaEnter}
                    onMouseLeave={handleMegaLeave}
                  >
                    {categorias.length === 0 ? (
                      <Link href="/store/catalogo" className="text-emerald-600 font-bold hover:underline">
                        Ver todo el catálogo
                      </Link>
                    ) : (
                      categorias.map((cat) => (
                        <div key={cat.nombre} className="space-y-2">
                          <Link
                            href={`/store/categoria/${encodeURIComponent(cat.nombre)}`}
                            className="block font-extrabold text-slate-900 text-sm hover:text-emerald-600 transition-colors uppercase tracking-wide"
                          >
                            {cat.nombre}
                          </Link>
                          {cat.sub_categorias?.map((sub) => (
                            <Link
                              key={sub}
                              href={`/store/categoria/${encodeURIComponent(sub)}`}
                              className="block text-xs text-slate-500 hover:text-emerald-600 transition-colors pl-2"
                            >
                              {sub}
                            </Link>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <Link href="/store/blog" className="px-3 py-2 rounded-lg hover:bg-slate-100 hover:text-emerald-600 transition-colors">
                Blog
              </Link>
              <Link href="/store/contacto" className="px-3 py-2 rounded-lg hover:bg-slate-100 hover:text-emerald-600 transition-colors">
                Contacto
              </Link>
              <Link href="/store/cuenta" className="px-3 py-2 rounded-lg hover:bg-slate-100 hover:text-emerald-600 transition-colors">
                Mi Cuenta
              </Link>
            </nav>

            <div className="flex items-center gap-2">
              <Link href="/store/catalogo" className="text-slate-500 hover:text-slate-800 p-2 rounded-full hover:bg-slate-100">
                <Search size={20} />
              </Link>
              <button
                onClick={() => setCartOpen(true)}
                className="relative text-slate-800 p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ShoppingBag size={24} />
                {cartCount > 0 && (
                  <span className="absolute top-0 right-0 w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-slate-100 bg-white px-4 py-4 space-y-1">
              <Link href="/store" className="block py-2 font-bold text-slate-700 hover:text-emerald-600" onClick={() => setMobileMenuOpen(false)}>Inicio</Link>
              <Link href="/store/catalogo" className="block py-2 font-bold text-slate-700 hover:text-emerald-600" onClick={() => setMobileMenuOpen(false)}>Catálogo</Link>
              {categorias.map((cat) => (
                <Link
                  key={cat.nombre}
                  href={`/store/categoria/${encodeURIComponent(cat.nombre)}`}
                  className="block py-1 pl-4 text-sm text-slate-500 hover:text-emerald-600"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {cat.nombre}
                </Link>
              ))}
              <Link href="/store/blog" className="block py-2 font-bold text-slate-700 hover:text-emerald-600" onClick={() => setMobileMenuOpen(false)}>Blog</Link>
              <Link href="/store/contacto" className="block py-2 font-bold text-slate-700 hover:text-emerald-600" onClick={() => setMobileMenuOpen(false)}>Contacto</Link>
              <Link href="/store/cuenta" className="block py-2 font-bold text-slate-700 hover:text-emerald-600" onClick={() => setMobileMenuOpen(false)}>Mi Cuenta</Link>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1 w-full relative z-0">
          {children}
        </main>

        {/* Slide-over Cart */}
        {isCartOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
            <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h2 className="text-xl font-extrabold text-slate-900">Tu Carrito ({cartCount})</h2>
                <button onClick={() => setCartOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {items.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-slate-400">
                    <ShoppingBag size={64} className="opacity-20" />
                    <p className="font-medium">Tu carrito está vacío.</p>
                    <button onClick={() => setCartOpen(false)} className="text-emerald-600 font-bold hover:underline">Continuar comprando</button>
                  </div>
                ) : (
                  items.map((item) => (
                    <div key={item.id + item.variant} className="flex gap-4">
                      <div className="w-20 h-24 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
                        {item.img ? (
                          <img src={item.img} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <ShoppingBag size={24} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm leading-tight">{item.name}</h4>
                          {item.variant && <p className="text-xs text-slate-500 mt-1">Variante: {item.variant}</p>}
                          <p className="font-black text-slate-900 mt-2">{formatCOP(item.price)}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">Cant: {item.qty}</span>
                          <button onClick={() => removeFromCart(item.id)} className="text-xs font-bold text-rose-500 hover:underline">Eliminar</button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {items.length > 0 && (
                <div className="p-6 border-t border-slate-100 bg-slate-50">
                  <div className="flex justify-between items-center mb-6">
                    <span className="font-bold text-slate-600">Subtotal</span>
                    <span className="font-black text-2xl text-slate-900">{formatCOP(cartTotal)}</span>
                  </div>
                  <Link
                    href="/store/checkout"
                    onClick={() => setCartOpen(false)}
                    className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold text-center block hover:bg-slate-800 transition-colors shadow-lg"
                  >
                    Ir al Checkout
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </CartContext.Provider>
  );
}