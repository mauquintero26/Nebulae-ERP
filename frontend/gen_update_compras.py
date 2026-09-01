import os

path = 'src/app/dashboard/compras/page.tsx'

content = """"use client";

import { useState, useEffect } from 'react';
import { 
  ShoppingCart, Search, Filter, Plus, FileText, 
  Truck, CheckCircle2, AlertTriangle, ArrowRight,
  PackageCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getPurchases, receivePurchase } from '@/lib/api';

export default function ComprasHub() {
  const [activeTab, setActiveTab] = useState('Pendientes');
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getPurchases();
      if (Array.isArray(data)) setPurchases(data);
    } catch (err: any) {
      toast.error('Error cargando compras: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReceive = async (id: number) => {
    toast.loading(`Registrando entrada al inventario (PO-${id})...`, { id: 'receive' });
    try {
      await receivePurchase(id);
      toast.success(`¡Inventario asentado correctamente!`, { id: 'receive' });
      fetchData(); // Reload
    } catch (err: any) {
      toast.error(err.message, { id: 'receive' });
    }
  };

  const TABS = ['Pendientes', 'Mercancía en Tránsito', 'Recibidas / Asentadas'];

  const filteredPurchases = purchases.filter(p => {
    if (activeTab === 'Pendientes') return p.status === 'DRAFT' || p.status === 'SENT';
    if (activeTab === 'Mercancía en Tránsito') return p.status === 'IN_TRANSIT';
    if (activeTab === 'Recibidas / Asentadas') return p.status === 'RECEIVED';
    return true;
  });

  return (
    <div className="w-full bg-slate-50 min-h-screen p-8 custom-scrollbar">
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-orange-100 text-orange-600 p-2 rounded-xl"><ShoppingCart size={24} /></div>
              Órdenes de Compra
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Gestión de proveedores, recepciones de inventario y facturación.</p>
          </div>
          <button className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm shadow-orange-200">
            <Plus size={18} /> Crear Pedido de Compra
          </button>
        </div>

        {/* WORKSPACE */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
          
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex gap-4">
            {TABS.map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  activeTab === tab 
                  ? 'bg-white shadow-sm border border-slate-200 text-orange-700' 
                  : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Buscar PO, proveedor, producto..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-3 focus:outline-none focus:border-orange-500 font-medium"
                />
              </div>
              <button className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm transition-colors">
                <Filter size={16} /> Filtros Avanzados
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase">PO ID</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase">Proveedor</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase">Total</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase">Fecha Est. Recepción</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase text-right">Acción Requerida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loading ? (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-bold">Cargando órdenes de compra...</td></tr>
                  ) : filteredPurchases.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium italic">No hay órdenes en esta vista.</td></tr>
                  ) : (
                    filteredPurchases.map(po => (
                      <tr key={po.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-6 py-4 font-black text-orange-700">PO-{po.id}</td>
                        <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-2">
                          <Truck size={16} className="text-slate-400"/> Proveedor #{po.supplier_id}
                        </td>
                        <td className="px-6 py-4 font-black text-slate-700">${po.total_amount || '0.00'}</td>
                        <td className="px-6 py-4 font-medium text-slate-500">
                          {po.expected_date ? new Date(po.expected_date).toLocaleDateString() : 'Por definir'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {po.status === 'IN_TRANSIT' && (
                            <button 
                              onClick={() => handleReceive(po.id)}
                              className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-600 hover:text-white px-3 py-1.5 rounded-lg font-bold transition-all shadow-sm flex items-center justify-end gap-1 ml-auto"
                            >
                              <PackageCheck size={14}/> Recibir Inventario
                            </button>
                          )}
                          {po.status === 'RECEIVED' && (
                            <span className="text-emerald-600 text-xs font-bold flex items-center justify-end gap-1">
                              <CheckCircle2 size={14}/> Asentado en Bodega
                            </span>
                          )}
                          {(po.status === 'DRAFT' || po.status === 'SENT') && (
                            <button className="text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-bold transition-all ml-auto">
                              Confirmar Tránsito
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
"""

with open('update_compras.py', 'w', encoding='utf-8') as script:
    script.write(f'''
import os
with open("{path}", "w", encoding="utf-8") as f:
    f.write("""{content}""")
''')

print("Created script to update Compras page.")
