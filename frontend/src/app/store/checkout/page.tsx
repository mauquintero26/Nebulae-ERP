"use client";

import { useCart } from '../layout';
import { ShieldCheck, Truck, Lock, ChevronRight, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

export default function CheckoutPage() {
  const { items, cartTotal, removeFromCart } = useCart();
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '', ciudad: '', notas: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pwebNumero, setPwebNumero] = useState('');
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setFormData(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) { setError('Tu carrito está vacío.'); return; }
    setIsSubmitting(true); setError('');
    try {
      const body = {
        customer_name: formData.name,
        customer_email: formData.email,
        customer_phone: formData.phone,
        customer_address: `${formData.address}, ${formData.ciudad}`,
        direccion_entrega: `${formData.address}, ${formData.ciudad}`,
        notas: formData.notas,
        productos: items.map(i => ({
          nombre: i.name,
          cantidad: i.qty,
          precio_cop: i.price,
          variante: i.variant,
          imagen: i.img,
        })),
        subtotal_cop: cartTotal,
        total_cop: cartTotal,
        canal_venta: 'WEB',
        canal_metadata: { user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '', origin: 'store_checkout' },
      };
      const r = await fetch(`${API}/ecommerce/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Error creando el pedido');
      setPwebNumero(d.data?.pweb_numero || d.data?.numero || '');
      // Clear cart items one by one
      items.forEach(i => removeFromCart(i.id));
      setSuccess(true);
    } catch (e: any) { setError(e.message || 'Error al procesar tu pedido. Intenta de nuevo.'); }
    setIsSubmitting(false);
  }
  if (success) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldCheck size={48} />
        </div>
        <h1 className="text-4xl font-black text-slate-900 mb-4">¡Pedido Confirmado!</h1>
        {pwebNumero && <p className="text-sm font-black text-purple-600 mb-2 bg-purple-50 inline-block px-4 py-1.5 rounded-full">Pedido # {pwebNumero}</p>}
        <p className="text-lg text-slate-600 mb-8 mt-4">Gracias por tu compra, {formData.name}. Tu pedido ha sido registrado y será procesado a la brevedad.</p>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm inline-block text-left mb-8">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Datos de Entrega</p>
          <p className="font-bold text-slate-900">{formData.address}, {formData.ciudad}</p>
          <p className="text-slate-600">{formData.phone}</p>
          {formData.email && <p className="text-slate-500 text-sm">{formData.email}</p>}
        </div>
        <div className="flex gap-4 justify-center">
          <Link href="/store" className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800">Seguir Comprando</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-500 mb-8">
        <span>Carrito</span> <ChevronRight size={16} /> <span className="text-slate-900">Checkout</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        
        {/* Formulario */}
        <div>
          <h2 className="text-2xl font-black text-slate-900 mb-6">Datos de Envío</h2>
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-red-700 text-sm">
              <AlertCircle size={16}/> {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Nombre Completo *</label>
              <input required type="text" value={formData.name} onChange={e => set('name', e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow" placeholder="Ej. María Pérez" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Correo Electrónico *</label>
              <input required type="email" value={formData.email} onChange={e => set('email', e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow" placeholder="tu@correo.com" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Celular / WhatsApp *</label>
              <input required type="tel" value={formData.phone} onChange={e => set('phone', e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow" placeholder="Ej. 300 123 4567" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Dirección Exacta *</label>
              <input required type="text" value={formData.address} onChange={e => set('address', e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow" placeholder="Calle 123 #45-67, Apto 101" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Ciudad / Municipio *</label>
              <input required type="text" value={formData.ciudad} onChange={e => set('ciudad', e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow" placeholder="Ej. Medellín, Bogotá, Cali" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Notas del Pedido (opcional)</label>
              <textarea value={formData.notas} onChange={e => set('notas', e.target.value)} rows={2}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow resize-none" placeholder="Instrucciones especiales de entrega..."/>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <h3 className="font-bold text-slate-900 mb-4">Método de Pago</h3>
              <div className="p-4 border-2 border-emerald-500 bg-emerald-50/50 rounded-xl flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full border-4 border-emerald-500"></div>
                  <span className="font-bold text-emerald-900">Tarjeta de Crédito / PSE (Wompi)</span>
                </div>
                <Lock size={20} className="text-emerald-500" />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isSubmitting || items.length === 0}
              className="w-full py-4 mt-8 bg-slate-900 text-white rounded-xl font-black text-lg hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-slate-900/20 flex justify-center items-center gap-3"
            >
              {isSubmitting ? 'Procesando Orden...' : `Pagar $${cartTotal.toLocaleString()}`}
            </button>
          </form>
        </div>

        {/* Resumen del Carrito */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm h-fit">
          <h2 className="text-xl font-black text-slate-900 mb-6">Resumen de tu Orden</h2>
          <div className="space-y-4 mb-6">
            {items.map(item => (
              <div key={item.id + item.variant} className="flex gap-4">
                <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                  <img src={item.img} alt={item.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-800 text-sm leading-tight">{item.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{item.variant}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-slate-900">${(item.price * item.qty).toLocaleString()}</p>
                  <p className="text-xs font-bold text-slate-500">Cant: {item.qty}</p>
                </div>
              </div>
            ))}
            {items.length === 0 && <p className="text-slate-500 text-sm italic">Tu carrito está vacío.</p>}
          </div>

          <div className="pt-6 border-t border-slate-100 space-y-3">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-bold">${cartTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Envío</span>
              <span className="font-bold text-emerald-600">Gratis</span>
            </div>
            <div className="flex justify-between text-xl font-black text-slate-900 pt-3 border-t border-slate-100">
              <span>Total a Pagar</span>
              <span>${cartTotal.toLocaleString()}</span>
            </div>
          </div>
          
          <div className="mt-8 bg-slate-50 p-4 rounded-xl flex items-start gap-3">
            <Truck className="text-slate-400 shrink-0" />
            <p className="text-xs text-slate-500 leading-relaxed">
              Tu orden está protegida por nuestra política de satisfacción. Los datos viajan cifrados directo a nuestro sistema central.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
