import os

path = 'src/app/dashboard/compras/page.tsx'

content = """"use client";

import { useState } from 'react';
import Link from 'next/link';
import { 
  ShoppingBag, AlertTriangle, Package, CheckCircle2, 
  Clock, Truck, Search, Filter, MoreVertical,
  Activity, ArrowRight, ShieldAlert, FileOutput, Receipt
} from 'lucide-react';

const SUB_MODULES = [
  { name: 'Pedidos de Compra', path: '/dashboard/compras/pedidos' },
  { name: 'Mercancía en Tránsito', path: '/dashboard/compras/transito' },
  { name: 'Recepciones (Entrada)', path: '/dashboard/compras/recepciones' },
  { name: 'Traslados Internos', path: '/dashboard/compras/traslados' },
  { name: 'Registro OCR/Manual', path: '/dashboard/compras/registro' },
  { name: 'Proyecciones', path: '/dashboard/compras/proyecciones' }
];

const MOCK_COMPRAS = [
  { id: 'PEC-0092', supplier: 'Tech Corp Asia', date: '2026-08-30', amount: 45000, status: 'Emitido', linkedSale: 'PVEN-0145', risk: 'low' },
  { id: 'PEC-0091', supplier: 'Logística Sur', date: '2026-08-28', amount: 12500, status: 'En Tránsito', linkedSale: 'Stock Base', risk: 'low' },
  { id: 'PEC-0090', supplier: 'Importaciones Global', date: '2026-08-25', amount: 8900, status: 'Retrasado', linkedSale: 'PVEN-0141', risk: 'high' },
  { id: 'PEC-0089', supplier: 'Embalajes Express', date: '2026-08-24', amount: 1200, status: 'Recibido', linkedSale: 'Consumo Interno', risk: 'none' },
  { id: 'PEC-0088', supplier: 'Tech Corp Asia', date: '2026-08-20', amount: 32000, status: 'Recibido', linkedSale: 'PVEN-0130', risk: 'none' },
];

export default function ComprasHub() {
  const [activeTab, setActiveTab] = useState('En Proceso');

  return (
    <div className="w-full bg-slate-50 min-h-max pb-12 animate-in fade-in custom-scrollbar">
      
      {/* 1. TABS: Sub-Módulos */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto custom-scrollbar flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Módulos:</span>
        {SUB_MODULES.map(mod => (
          <Link 
            key={mod.name} 
            href={mod.path}
            className="shrink-0 px-4 py-1.5 rounded-full text-sm font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border border-transparent hover:border-emerald-200"
          >
            {mod.name}
          </Link>
        ))}
      </div>

      {/* 2. Banner de Alertas (Riesgo en Suministros) */}
      <div className="bg-orange-50 border-b border-orange-200 px-6 py-3 flex items-start gap-4 z-20 relative">
        <ShieldAlert className="text-orange-600 shrink-0 mt-0.5" size={20} />
        <div className="flex-1">
          <h4 className="text-sm font-black text-orange-800">ALERTA DE CADENA DE SUMINISTRO (Riesgo de incumplimiento a clientes)</h4>
          <p className="text-xs font-bold text-orange-600 mt-1">
            • 2 Pedidos varados en Aduana (Afecta Venta PVEN-0141) | • 1 Proveedor (Tech Corp Asia) con SLA de entrega vencido.
          </p>
        </div>
        <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-orange-700 transition-colors shrink-0">
          Gestionar Retrasos
        </button>
      </div>

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        
        {/* Header Principal */}
        <div className="flex justify-between items-center mb-2">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl shadow-inner"><ShoppingBag size={24} /></div>
              Central de Compras & Abastecimiento
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Control integral de abastecimiento: órdenes de compra, control de tránsito y verificación de recepciones.</p>
          </div>
          <Link href="/dashboard/compras/pedidos" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-colors flex items-center gap-2">
            <Receipt size={18} /> Emitir Pedido de Compra
          </Link>
        </div>

        {/* 3. KPIs Estratégicos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-emerald-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
              <Receipt size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Pedidos Abiertos (No Recibidos)</p>
            <h2 className="text-3xl font-black text-slate-800">18</h2>
            <p className="text-xs font-bold text-slate-500 mt-2 flex items-center gap-1"><Clock size={14}/> 4 a la espera de confirmación</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-blue-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
              <Truck size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Capital en Tránsito (Inventario Flotante)</p>
            <h2 className="text-3xl font-black text-slate-800">$184,200</h2>
            <p className="text-xs font-bold text-blue-600 mt-2 flex items-center gap-1">Distribuido en 7 embarques marítimos/aéreos</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-amber-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform">
              <Package size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Días de Retraso Promedio</p>
            <h2 className="text-3xl font-black text-slate-800">3.4 Días</h2>
            <p className="text-xs font-bold text-red-500 mt-2 flex items-center gap-1"><AlertTriangle size={14}/> Cuidado: Afectando SLA de entregas</p>
          </div>

          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden group cursor-pointer">
            <div className="absolute right-0 top-0 opacity-20"><Activity size={100} /></div>
            <p className="text-xs font-black text-emerald-200 uppercase tracking-wider mb-1 relative z-10">Gasto Ejecutado (Mes)</p>
            <h2 className="text-3xl font-black text-white relative z-10">$85,400</h2>
            <p className="text-xs font-bold text-emerald-100 mt-2 flex items-center gap-1 relative z-10">75% del presupuesto autorizado</p>
          </div>
        </div>

        {/* 4. Tabla Maestra de Compras */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex gap-2 bg-slate-200/50 p-1 rounded-xl">
              <button 
                onClick={() => setActiveTab('En Proceso')}
                className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'En Proceso' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                En Proceso / Tránsito
              </button>
              <button 
                onClick={() => setActiveTab('Recibidos')}
                className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'Recibidos' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Mercancía Recibida
              </button>
              <button 
                onClick={() => setActiveTab('Alertas')}
                className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'Alertas' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Retrasos Críticos
              </button>
            </div>
            
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-64 flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100 transition-all shadow-sm">
                <Search className="text-slate-400 shrink-0 mr-2" size={16} />
                <input 
                  type="text" 
                  placeholder="Buscar PEC, Proveedor..." 
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
                  <th className="px-6 py-4">ID Compra</th>
                  <th className="px-6 py-4">Proveedor</th>
                  <th className="px-6 py-4">Asignado A (Trazabilidad)</th>
                  <th className="px-6 py-4">Monto Estimado</th>
                  <th className="px-6 py-4">Fase / Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {MOCK_COMPRAS.filter(c => {
                  if (activeTab === 'En Proceso') return c.status === 'Emitido' || c.status === 'En Tránsito';
                  if (activeTab === 'Recibidos') return c.status === 'Recibido';
                  if (activeTab === 'Alertas') return c.status === 'Retrasado';
                  return true;
                }).map((compra, i) => (
                  <tr key={compra.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-black text-emerald-700">{compra.id}</span>
                        <span className="text-[10px] font-bold text-slate-400 mt-0.5">{compra.date}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-800">{compra.supplier}</td>
                    <td className="px-6 py-4">
                      {compra.linkedSale !== 'Consumo Interno' && compra.linkedSale !== 'Stock Base' ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded inline-block w-max">
                            Venta: {compra.linkedSale}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-slate-500">{compra.linkedSale}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-black text-slate-800">${compra.amount.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      {compra.status === 'Emitido' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200"><Clock size={12}/> Emitido (Esperando Aprob.)</span>}
                      {compra.status === 'En Tránsito' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200"><Truck size={12}/> En Tránsito Marítimo</span>}
                      {compra.status === 'Recibido' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><CheckCircle2 size={12}/> Recepción Aprobada</span>}
                      {compra.status === 'Retrasado' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-red-100 text-red-800 border border-red-200"><AlertTriangle size={12}/> Aduana / Retraso Crítico</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {compra.status === 'En Tránsito' && (
                          <Link href="/dashboard/compras/recepciones" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition-colors">
                            <Package size={14}/> Procesar Entrada
                          </Link>
                        )}
                        <button className="text-slate-400 hover:text-slate-700 p-1 transition-colors">
                          <MoreVertical size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {MOCK_COMPRAS.filter(c => {
                  if (activeTab === 'En Proceso') return c.status === 'Emitido' || c.status === 'En Tránsito';
                  if (activeTab === 'Recibidos') return c.status === 'Recibido';
                  if (activeTab === 'Alertas') return c.status === 'Retrasado';
                  return true;
                }).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">
                      No hay registros en esta categoría de compras.
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

print("Compras Hub rebuilt with tabs, rich table, and advanced alerts.")
