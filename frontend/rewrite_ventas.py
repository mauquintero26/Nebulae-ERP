import os

path = 'src/app/dashboard/ventas/page.tsx'

content = """"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  TrendingUp, AlertTriangle, FileText, CheckCircle2, 
  Clock, DollarSign, Search, Filter, MoreVertical,
  Activity, ArrowRight, ShieldAlert, FileOutput, Users, Target
} from 'lucide-react';

const SUB_MODULES = [
  { name: 'Solicitud', path: '/dashboard/ventas/solicitud' },
  { name: 'Cotización', path: '/dashboard/ventas/cotizacion' },
  { name: 'Venta', path: '/dashboard/ventas/venta' },
  { name: 'Exportar Día', path: '/dashboard/ventas/exportar-dia' },
  { name: 'Exportar Rango', path: '/dashboard/ventas/exportar-rango' },
  { name: 'Sincronización DB', path: '/dashboard/ventas/sincronizacion' },
  { name: 'Proyecciones', path: '/dashboard/ventas/proyecciones' }
];

const MOCK_SALES = [
  { id: 'PVEN-0145', client: 'Acme Corp', date: '2026-08-30', amount: 15400, type: 'B2B', status: 'Pendiente', risk: 'high', quoteId: 'COT-089' },
  { id: 'PVEN-0144', client: 'Industrias Stark', date: '2026-08-29', amount: 8200, type: 'B2B', status: 'Facturado', risk: 'low', quoteId: 'COT-088' },
  { id: 'PVEN-0143', client: 'Wayne Enterprises', date: '2026-08-28', amount: 45000, type: 'Licitación', status: 'Pendiente', risk: 'medium', quoteId: 'COT-085' },
  { id: 'PVEN-0142', client: 'Venta Mostrador', date: '2026-08-28', amount: 450, type: 'Retail', status: 'Facturado', risk: 'low', quoteId: 'Directo' },
  { id: 'PVEN-0141', client: 'Global Dynamics', date: '2026-08-25', amount: 12000, type: 'B2B', status: 'Mora', risk: 'high', quoteId: 'COT-080' },
];

export default function VentasHub() {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState('Pendientes');

  return (
    <div className="w-full bg-slate-50 min-h-max pb-12 animate-in fade-in custom-scrollbar">
      
      {/* 1. TABS: Sub-Módulos */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto custom-scrollbar flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Módulos:</span>
        {SUB_MODULES.map(mod => (
          <Link 
            key={mod.name} 
            href={mod.path}
            className="shrink-0 px-4 py-1.5 rounded-full text-sm font-bold text-slate-600 hover:bg-purple-50 hover:text-purple-700 transition-colors border border-transparent hover:border-purple-200"
          >
            {mod.name}
          </Link>
        ))}
      </div>

      {/* 2. Banner de Alertas (Trazabilidad y Riesgo) */}
      <div className="bg-rose-50 border-b border-rose-200 px-6 py-3 flex items-start gap-4 z-20 relative">
        <ShieldAlert className="text-rose-600 shrink-0 mt-0.5" size={20} />
        <div className="flex-1">
          <h4 className="text-sm font-black text-rose-800">ATENCIÓN REQUERIDA (Riesgo de pérdida de ventas)</h4>
          <p className="text-xs font-bold text-rose-600 mt-1">
            • 3 Solicitudes sin atender (+48h) | • 5 Cotizaciones vencen hoy | • $27,400 Pendientes por facturar (Flujo de caja afectado)
          </p>
        </div>
        <button className="bg-rose-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-rose-700 transition-colors shrink-0">
          Resolver Alertas
        </button>
      </div>

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        
        {/* Header Principal */}
        <div className="flex justify-between items-center mb-2">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-purple-100 text-purple-600 p-2 rounded-xl shadow-inner"><TrendingUp size={24} /></div>
              Central de Ventas & Facturación
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Control total del ciclo comercial: desde la solicitud del lead hasta la facturación y cierre.</p>
          </div>
          <Link href="/dashboard/ventas/venta" className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-colors flex items-center gap-2">
            <DollarSign size={18} /> Nueva Venta Directa
          </Link>
        </div>

        {/* 3. KPIs Estratégicos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-amber-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform">
              <FileText size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Cotizaciones Atascadas</p>
            <h2 className="text-3xl font-black text-slate-800">12</h2>
            <p className="text-xs font-bold text-amber-600 mt-2 flex items-center gap-1"><Clock size={14}/> Requieren seguimiento (SLA)</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-emerald-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
              <DollarSign size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Pendiente de Facturar</p>
            <h2 className="text-3xl font-black text-slate-800">$60,400</h2>
            <p className="text-xs font-bold text-slate-500 mt-2 flex items-center gap-1">En 8 Pedidos de Venta aprobados</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-blue-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
              <Target size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Tasa de Conversión</p>
            <h2 className="text-3xl font-black text-slate-800">32.4%</h2>
            <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1"><TrendingUp size={14}/> +4% vs mes anterior</p>
          </div>

          <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden group cursor-pointer">
            <div className="absolute right-0 top-0 opacity-20"><Activity size={100} /></div>
            <p className="text-xs font-black text-purple-200 uppercase tracking-wider mb-1 relative z-10">Ventas Facturadas (Mes)</p>
            <h2 className="text-3xl font-black text-white relative z-10">$142,000</h2>
            <p className="text-xs font-bold text-emerald-300 mt-2 flex items-center gap-1 relative z-10">Meta al 85% - ¡Falta poco!</p>
          </div>
        </div>

        {/* 4. Tabla Maestra de Facturación e Histórico */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex gap-2">
              <button 
                onClick={() => setActiveTab('Pendientes')}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'Pendientes' ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Pendientes por Facturar
              </button>
              <button 
                onClick={() => setActiveTab('Facturados')}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'Facturados' ? 'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Facturados
              </button>
            </div>
            
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-64 flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100 transition-all shadow-sm">
                <Search className="text-slate-400 shrink-0 mr-2" size={16} />
                <input 
                  type="text" 
                  placeholder="Buscar PVEN, Cliente..." 
                  className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 outline-none"
                />
              </div>
              <button className="bg-white border border-slate-300 p-2.5 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
                <Filter size={18} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">ID Venta (Trazabilidad)</th>
                  <th className="px-6 py-4">Cliente / Origen</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Monto</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {MOCK_SALES.filter(s => activeTab === 'Pendientes' ? s.status !== 'Facturado' : s.status === 'Facturado').map((sale, i) => (
                  <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-black text-purple-700">{sale.id}</span>
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mt-0.5">
                          Viene de: <Link href="/dashboard/ventas/cotizacion" className="text-blue-500 hover:underline">{sale.quoteId}</Link>
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{sale.client}</span>
                        <span className="text-[11px] font-medium text-slate-500">{sale.type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-600">{sale.date}</td>
                    <td className="px-6 py-4 font-black text-slate-800">${sale.amount.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      {sale.status === 'Pendiente' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200"><Clock size={12}/> Pendiente Fact.</span>}
                      {sale.status === 'Facturado' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><CheckCircle2 size={12}/> Facturado</span>}
                      {sale.status === 'Mora' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-red-100 text-red-800 border border-red-200"><AlertTriangle size={12}/> Mora / Retraso</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {sale.status !== 'Facturado' && (
                          <button className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition-colors">
                            <FileOutput size={14}/> Facturar
                          </button>
                        )}
                        <button className="text-slate-400 hover:text-slate-700 p-1 transition-colors">
                          <MoreVertical size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {MOCK_SALES.filter(s => activeTab === 'Pendientes' ? s.status !== 'Facturado' : s.status === 'Facturado').length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">
                      No hay registros en esta categoría.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Ventas Hub rebuilt with tabs, rich table, and advanced alerts.")
