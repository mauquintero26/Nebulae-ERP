"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSalesOrder } from '@/lib/api';
import toast from 'react-hot-toast';
import { ArrowLeft, Save, User, Package } from 'lucide-react';
import Link from 'next/link';

export default function NuevaSolicitud() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    customer_id: 1, // Default mock customer ID since we don't have CRM list yet
    sale_type: 'B2B',
  });
  
  const [lines, setLines] = useState([{ sku_id: 1, quantity: 1, unit_price: 0 }]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    toast.loading('Creando solicitud...', { id: 'create' });
    
    try {
      const payload = {
        customer_id: Number(formData.customer_id),
        status: 'DRAFT', // Estado inicial
        sale_type: formData.sale_type,
        anticipo: 0,
        lines: lines.map(l => ({
          sku_id: Number(l.sku_id),
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price)
        }))
      };
      
      await createSalesOrder(payload);
      toast.success('Solicitud creada exitosamente', { id: 'create' });
      router.push('/dashboard/ventas/solicitud');
    } catch (error: any) {
      toast.error(error.message, { id: 'create' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full bg-slate-50 min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/dashboard/ventas/solicitud" className="text-purple-600 font-bold text-sm flex items-center gap-1 mb-6 hover:underline">
          <ArrowLeft size={16} /> Volver a Solicitudes
        </Link>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 bg-purple-600 text-white border-b border-purple-700">
            <h1 className="text-2xl font-black">Crear Nueva Solicitud</h1>
            <p className="text-purple-200 text-sm mt-1">Inicia el flujo de venta registrando un requerimiento de cliente.</p>
          </div>
          
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2"><User size={14}/> ID de Cliente (CRM)</label>
                <input 
                  type="number" 
                  value={formData.customer_id}
                  onChange={e => setFormData({...formData, customer_id: Number(e.target.value)})}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2 font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Tipo de Venta</label>
                <select 
                  value={formData.sale_type}
                  onChange={e => setFormData({...formData, sale_type: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2 font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  <option value="B2B">Corporativo (B2B)</option>
                  <option value="RETAIL">Retail / Mostrador</option>
                  <option value="E-COMMERCE">E-Commerce</option>
                </select>
              </div>
            </div>

            <hr className="border-slate-100" />
            
            <div>
              <div className="flex justify-between items-center mb-4">
                <label className="text-sm font-black text-slate-800 flex items-center gap-2"><Package size={16} className="text-purple-600"/> Productos Solicitados</label>
                <button type="button" onClick={() => setLines([...lines, { sku_id: 1, quantity: 1, unit_price: 0 }])} className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg hover:bg-purple-100">
                  + Agregar Línea
                </button>
              </div>
              
              <div className="space-y-3">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex gap-4 items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-400 block mb-1">ID Producto (SKU)</span>
                      <input type="number" value={line.sku_id} onChange={e => { const newL = [...lines]; newL[idx].sku_id = Number(e.target.value); setLines(newL); }} className="w-full px-3 py-1.5 border rounded-lg text-sm font-bold" />
                    </div>
                    <div className="w-24">
                      <span className="text-xs font-bold text-slate-400 block mb-1">Cantidad</span>
                      <input type="number" value={line.quantity} onChange={e => { const newL = [...lines]; newL[idx].quantity = Number(e.target.value); setLines(newL); }} className="w-full px-3 py-1.5 border rounded-lg text-sm font-bold" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 flex justify-end">
              <button 
                type="submit" 
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-xl font-black shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <Save size={18} /> {loading ? 'Guardando...' : 'Crear Solicitud'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
