"use client";

import Link from 'next/link';

const STORE_MOCKS = [
  { id: '1', name: 'Vestido Materno Elegance', price: 120000, img: 'https://images.unsplash.com/photo-1620245033785-0210f63d6b38?auto=format&fit=crop&q=80&w=400&h=500' },
  { id: '2', name: 'Camiseta Básica Lactancia', price: 45000, img: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=400&h=500' },
  { id: '3', name: 'Pantalón Ajustable Comfort', price: 95000, img: 'https://images.unsplash.com/photo-1542272201-b1ca555f8505?auto=format&fit=crop&q=80&w=400&h=500' },
  { id: '4', name: 'Bolso Pañalero Premium', price: 180000, img: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&q=80&w=400&h=500' },
];

export default function StoreHomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      
      {/* Hero Banner */}
      <div className="relative w-full h-[60vh] min-h-[400px] rounded-3xl overflow-hidden bg-slate-900 mb-16 shadow-2xl">
        <img 
          src="https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&q=80&w=1600" 
          alt="Hero" 
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
          <span className="text-emerald-400 font-black tracking-widest uppercase text-sm mb-4">Nueva Colección 2026</span>
          <h1 className="text-4xl md:text-6xl font-black text-white mb-6 max-w-2xl leading-tight">
            Comodidad que se adapta a ti.
          </h1>
          <button className="px-8 py-4 bg-white text-slate-900 rounded-full font-bold hover:bg-slate-100 transition-transform hover:scale-105">
            Explorar Colección
          </button>
        </div>
      </div>

      {/* Product Grid */}
      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-900">Recién Llegados</h2>
        <Link href="#" className="text-sm font-bold text-emerald-600 hover:underline">Ver todos</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8">
        {STORE_MOCKS.map((product) => (
          <Link key={product.id} href={`/store/product/${product.id}`} className="group flex flex-col cursor-pointer">
            <div className="relative w-full aspect-[4/5] bg-slate-100 rounded-2xl overflow-hidden mb-4">
              <img 
                src={product.img} 
                alt={product.name} 
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-full py-2 bg-white/90 backdrop-blur-sm text-center text-slate-900 font-bold rounded-xl text-sm">
                  Ver Detalles
                </div>
              </div>
            </div>
            <h3 className="font-bold text-slate-800 leading-tight mb-1 group-hover:text-emerald-600 transition-colors">{product.name}</h3>
            <p className="font-black text-slate-900">${product.price.toLocaleString()}</p>
          </Link>
        ))}
      </div>

    </div>
  );
}
