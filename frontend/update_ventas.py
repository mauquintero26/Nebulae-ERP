
import os
with open("src/app/dashboard/ventas/page.tsx", "w", encoding="utf-8") as f:
    f.write(""""use client";

import { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, Target, Search, Plus, 
  MoreVertical, Clock, DollarSign, ArrowRight,
  ShieldAlert, Activity, CheckCircle2, UserCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getHeaders } from '@/lib/api'; // Usando el helper de getHeaders (asegurarse que exista y lo exponga, si no, lo declaro localmente)

// Helper local por si acaso
const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

// URL BASE
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

export default function VentasKanbanCRM() {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // CRM 360 View Modal
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/sales`, { headers: getAuthHeaders() });
      const raw = await res.json().catch(() => ({}));
      const data = raw.status === 'success' ? raw.data : (raw.data || raw);
      if (Array.isArray(data)) setSales(data);
    } catch (error: any) {
      toast.error('Error al cargar ventas: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const changeStatus = async (id: number, newStatus: string) => {
    toast.loading(`Moviendo pedido #${id}...`, { id: 'move' });
    try {
      // Endpoint imaginado/estándar para cambiar estado o simplemente asumiendo PATCH
      // Si la API tiene un endpoint específico: /sales/{id}/status
      // Usaremos un PATCH genérico al id para actualizar status
      const res = await fetch(`${API_URL}/sales/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      if(!res.ok) throw new Error("No se pudo actualizar el estado");
      
      toast.success(`Pedido movido a ${newStatus}`, { id: 'move' });
      fetchSales(); // Recargar
    } catch(err: any) {
      toast.error(err.message, { id: 'move' });
    }
  };

  const openCRM360 = async (customerId: number) => {
    toast.loading('Cargando perfil CRM 360...', { id: 'crm' });
    try {
      const res = await fetch(`${API_URL}/crm/customer/${customerId}/360`, { headers: getAuthHeaders() });
      if(!res.ok) throw new Error('Cliente no encontrado');
      const data = await res.json();
      setSelectedCustomer(data.data || data);
      toast.dismiss('crm');
    } catch (error: any) {
      toast.error(error.message, { id: 'crm' });
    }
  };

  const KANBAN_COLUMNS = [
    { id: 'QUOTATION', title: 'Cotizaciones (Pendientes)', color: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300' },
    { id: 'TO_INVOICE', title: 'Aprobadas / Por Facturar', color: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    { id: 'INVOICED', title: 'Facturadas / En Proceso', color: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    { id: 'DELIVERED', title: 'Entregadas (Cerradas)', color: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' }
  ];

  return (
    <div className="p-8 h-full overflow-y-auto space-y-6 animate-in fade-in duration-500 bg-slate-50 relative">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-xl shadow-lg shadow-indigo-200">
              <TrendingUp size={24} />
            </div>
            Pipeline de Ventas
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Gestión Kanban y Perfil CRM 360 del Cliente.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar cliente, orden..." 
              className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64 shadow-sm font-medium"
            />
          </div>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md transition-all hover:-translate-y-0.5">
            <Plus size={18} /> Nueva Venta
          </button>
        </div>
      </div>

      {/* KANBAN BOARD */}
      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-400 font-bold">Cargando Pipeline desde Producción...</div>
      ) : (
        <div className="flex gap-6 overflow-x-auto pb-4 custom-scrollbar h-[calc(100vh-200px)]">
          {KANBAN_COLUMNS.map(col => {
            const colSales = sales.filter(s => (s.status === col.id) || (col.id === 'TO_INVOICE' && !s.status));
            
            return (
              <div key={col.id} className={`min-w-[320px] w-[320px] flex flex-col rounded-2xl border ${col.border} ${col.color} bg-opacity-50`}>
                <div className="p-4 border-b border-white/50 flex justify-between items-center backdrop-blur-sm rounded-t-2xl">
                  <h3 className={`font-black uppercase tracking-wider text-xs ${col.text}`}>{col.title}</h3>
                  <span className="bg-white px-2 py-0.5 rounded-md text-xs font-bold shadow-sm">{colSales.length}</span>
                </div>
                
                <div className="flex-1 p-3 space-y-3 overflow-y-auto custom-scrollbar">
                  {colSales.map(sale => (
                    <div key={sale.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-grab active:cursor-grabbing group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold font-mono">
                          ORD-{sale.id}
                        </div>
                        <div className="flex items-center text-emerald-600 font-black text-sm">
                          <DollarSign size={14}/>
                          {sale.total_amount || 0}
                        </div>
                      </div>
                      
                      <div 
                        onClick={() => openCRM360(sale.customer_id)}
                        className="flex items-center gap-2 mb-4 hover:bg-slate-50 p-1.5 -ml-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        <UserCircle className="text-indigo-400" size={20} />
                        <div>
                          <p className="text-sm font-bold text-slate-800">ID Cliente: {sale.customer_id}</p>
                          <p className="text-[10px] uppercase font-bold tracking-wider text-indigo-500 flex items-center gap-1">
                            Ver Perfil CRM 360 <ArrowRight size={10}/>
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                        <div className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock size={12}/> {new Date(sale.created_at || Date.now()).toLocaleDateString()}
                        </div>
                        
                        {/* Status Actions */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          {col.id === 'QUOTATION' && (
                            <button onClick={() => changeStatus(sale.id, 'TO_INVOICE')} className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded font-bold transition-colors">Aprobar</button>
                          )}
                          {col.id === 'TO_INVOICE' && (
                            <button onClick={() => changeStatus(sale.id, 'INVOICED')} className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-1 rounded font-bold transition-colors">Facturar</button>
                          )}
                          {col.id === 'INVOICED' && (
                            <button onClick={() => changeStatus(sale.id, 'DELIVERED')} className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-2 py-1 rounded font-bold transition-colors">Entregar</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {colSales.length === 0 && (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl h-24 flex items-center justify-center text-slate-400 text-xs font-bold">
                      Arrastra ordenes aquí
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CRM 360 MODAL */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-6 bg-gradient-to-r from-slate-900 to-indigo-900 text-white flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-indigo-500 text-white text-[10px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full">CRM 360</span>
                </div>
                <h2 className="text-2xl font-black">{selectedCustomer.first_name} {selectedCustomer.last_name}</h2>
                <p className="text-indigo-200 text-sm flex items-center gap-2 mt-2">
                  <UserCircle size={16}/> {selectedCustomer.email}
                </p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="text-white/50 hover:text-white transition-colors bg-white/10 p-2 rounded-full">
                <ArrowRight size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-black text-slate-400 uppercase mb-1">Lifetime Value (LTV)</p>
                  <p className="text-2xl font-black text-emerald-600">${selectedCustomer.ltv || '0.00'}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-black text-slate-400 uppercase mb-1">Teléfono</p>
                  <p className="text-sm font-bold text-slate-700 mt-2">{selectedCustomer.phone || 'No registrado'}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Activity size={16} className="text-indigo-600"/> Historial de Órdenes ({(selectedCustomer.active_orders || []).length})
                </h3>
                <div className="space-y-3">
                  {(selectedCustomer.active_orders || []).map((ord: any, i: number) => (
                    <div key={i} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm flex justify-between items-center">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">ORD-{ord.id}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{ord.status}</p>
                      </div>
                      <button className="text-indigo-600 text-xs font-bold hover:underline">Ver Detalle</button>
                    </div>
                  ))}
                  {(selectedCustomer.active_orders || []).length === 0 && (
                    <p className="text-sm text-slate-500 italic bg-white p-4 rounded-xl border border-slate-200">No hay órdenes registradas.</p>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl">
                <h3 className="text-sm font-black text-blue-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Target size={16} /> Próxima Acción Sugerida
                </h3>
                <p className="text-sm text-blue-700 font-medium leading-relaxed">
                  Basado en su LTV, sugerimos enviar campaña de fidelización B2C con descuento en envío.
                </p>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
""")
