"use client";

import { useState } from 'react';
import { useCart } from '../../layout';
import { ShoppingBag, Star, Truck, ShieldCheck } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function ProductDetailPage() {
  const { id } = useParams();
  const { addToCart } = useCart();
  const [selectedColor, setSelectedColor] = useState('Negro');
  const [selectedSize, setSelectedSize] = useState('M');

  // Hardcoded mock since this is a UI prototype
  const product = {
    id: typeof id === 'string' ? id : '1',
    name: 'Vestido Materno Elegance',
    price: 120000,
    desc: 'Vestido diseñado especialmente para ajustarse a los cambios de tu cuerpo. Tela stretch de algodón premium que no se deforma. Ideal para cualquier ocasión casual o formal.',
    img: 'https://images.unsplash.com/photo-1620245033785-0210f63d6b38?auto=format&fit=crop&q=80&w=800&h=1000'
  };

  const handleAdd = () => {
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      qty: 1,
      variant: `${selectedColor} - ${selectedSize}`,
      img: product.img
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
        
        {/* Images */}
        <div className="bg-slate-100 rounded-3xl overflow-hidden aspect-[4/5]">
          <img src={product.img} alt={product.name} className="w-full h-full object-cover" />
        </div>

        {/* Details */}
        <div className="flex flex-col pt-4">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-2 leading-tight">{product.name}</h1>
          <div className="flex items-center gap-2 mb-6">
            <div className="flex text-amber-400"><Star size={16} fill="currentColor"/><Star size={16} fill="currentColor"/><Star size={16} fill="currentColor"/><Star size={16} fill="currentColor"/><Star size={16} className="text-slate-200" fill="currentColor"/></div>
            <span className="text-sm text-slate-500 font-medium">124 reseñas</span>
          </div>
          <p className="text-3xl font-black text-emerald-600 mb-8">${product.price.toLocaleString()}</p>
          
          <p className="text-slate-600 mb-8 leading-relaxed">{product.desc}</p>

          <hr className="border-slate-100 mb-8" />

          {/* Color Selector */}
          <div className="mb-6">
            <h3 className="font-bold text-slate-900 mb-3 uppercase text-sm tracking-wider">Color: {selectedColor}</h3>
            <div className="flex gap-3">
              {['Negro', 'Rosa Pastel', 'Gris Jaspe'].map(c => (
                <button 
                  key={c}
                  onClick={() => setSelectedColor(c)}
                  className={`w-12 h-12 rounded-full border-2 transition-all ${selectedColor === c ? 'border-slate-900 scale-110' : 'border-transparent shadow-sm'}`}
                  style={{ backgroundColor: c === 'Negro' ? '#1e293b' : c === 'Rosa Pastel' ? '#fecdd3' : '#94a3b8' }}
                />
              ))}
            </div>
          </div>

          {/* Size Selector */}
          <div className="mb-10">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-900 uppercase text-sm tracking-wider">Talla</h3>
              <button className="text-xs font-bold text-emerald-600 hover:underline">Guía de tallas</button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {['S', 'M', 'L', 'XL'].map(s => (
                <button 
                  key={s}
                  onClick={() => setSelectedSize(s)}
                  className={`py-3 rounded-xl font-bold border transition-colors ${selectedSize === s ? 'border-slate-900 bg-slate-900 text-white shadow-lg' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleAdd} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 hover:bg-emerald-700 shadow-xl shadow-emerald-200 transition-all hover:-translate-y-1">
            <ShoppingBag size={24} />
            Añadir al Carrito
          </button>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-600 bg-slate-50 p-4 rounded-xl">
              <Truck className="text-emerald-500" />
              <span>Envío gratis desde $150k</span>
            </div>
            <div className="flex items-center gap-3 text-sm font-medium text-slate-600 bg-slate-50 p-4 rounded-xl">
              <ShieldCheck className="text-blue-500" />
              <span>Garantía de 30 días</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
