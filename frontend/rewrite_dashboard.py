import os

path = 'src/app/dashboard/page.tsx'

content = """"use client";

import { useState } from 'react';
import { 
  TrendingUp, AlertTriangle, Package, CheckCircle2, 
  Clock, Truck, DollarSign, Users, Target, ArrowRight,
  BrainCircuit, Sparkles, Activity, ShoppingCart, UserCheck,
  Calendar, ChevronRight, BarChart3
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardGeneral() {
  const [timeRange, setTimeRange] = useState('Hoy');

  return (
    <div className="w-full bg-slate-50 min-h-max pb-12 animate-in fade-in custom-scrollbar">
      
      {/* 1. Banner de Alertas Críticas (El Radar) */}
      <div className="bg-red-600 text-white px-6 py-2.5 flex items-center justify-center gap-4 shadow-sm shrink-0 relative z-20">
        <span className="flex h-2.5 w-2.5 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
        </span>
        <AlertTriangle size={16} className="text-red-200" />
        <p className="text-sm font-bold tracking-wide">
          ALERTA CRÍTICA: <span className="font-normal opacity-90">Pedido de Compra PEC-0089 retrasado en aduana (Impacta 2 ventas B2B).</span>
        </p>
        <button className="text-xs font-bold underline hover:text-red-200 ml-2">Ver Detalles</button>
      </div>

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Activity className="text-purple-600" size={28} /> Torre de Control
            </h1>
            <p className="text-slate-500 mt-1 font-medium flex items-center gap-2">
              <Calendar size={14} /> Jueves, 28 de Agosto 2026
            </p>
          </div>
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            {['Hoy', 'Semana', 'Mes'].map((t) => (
              <button 
                key={t}
                onClick={() => setTimeRange(t)}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${timeRange === t ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* 2. El Copiloto IA */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-blue-900 rounded-3xl p-1 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
            <BrainCircuit size={120} className="text-white" />
          </div>
          <div className="bg-slate-900/40 backdrop-blur-md rounded-[22px] p-6 flex flex-col md:flex-row items-center md:items-start gap-6 relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.4)] shrink-0">
              <Sparkles className="text-white" size={32} />
            </div>
            <div className="flex-1 text-white">
              <h3 className="font-bold text-lg text-purple-200 mb-1">Brief Ejecutivo Diario</h3>
              <p className="text-slate-300 leading-relaxed font-medium">
                Hola Admin. Las ventas van un <span className="text-emerald-400 font-bold">+15%</span> arriba respecto al objetivo del día gracias a 3 cierres fuertes de Laura. 
                Sin embargo, tienes <span className="text-amber-400 font-bold">2 entregas en riesgo</span> por quiebre de stock en el producto "Servidor Rack 2U".
              </p>
              <div className="mt-4 flex gap-3">
                <button className="bg-white text-slate-900 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors">
                  Generar Orden de Abastecimiento Urgente
                </button>
                <button className="bg-slate-800 text-slate-300 border border-slate-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-700 transition-colors">
                  Ver Desempeño de Laura
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Los 4 KPIs Vitales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
              <DollarSign size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Ingresos ({timeRange})</p>
            <h2 className="text-3xl font-black text-slate-800">$45,250</h2>
            <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1"><TrendingUp size={14}/> +12.5% vs ayer</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-blue-300 hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
              <ShoppingCart size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Ticket Promedio</p>
            <h2 className="text-3xl font-black text-slate-800">$1,850</h2>
            <p className="text-xs font-bold text-blue-500 mt-2 flex items-center gap-1">Saludable (B2B domina)</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-purple-300 hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 mb-4 group-hover:scale-110 transition-transform">
              <Target size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Tasa de Cierre (CRM)</p>
            <h2 className="text-3xl font-black text-slate-800">24.5%</h2>
            <p className="text-xs font-bold text-amber-500 mt-2 flex items-center gap-1">12 cotizaciones estancadas</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-110 transition-transform">
              <Truck size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Entregas a Tiempo (SLA)</p>
            <h2 className="text-3xl font-black text-slate-800">96.2%</h2>
            <p className="text-xs font-bold text-red-500 mt-2 flex items-center gap-1">3 pedidos en riesgo rojo</p>
          </div>
        </div>

        {/* 4. División Estratégica & 5. Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Venta por Pedido (B2B) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <BarChart3 className="text-blue-500" size={18} /> Embudo B2B (Por Pedido)
              </h3>
              <Link href="/dashboard/ventas/cotizacion" className="text-xs font-bold text-blue-600 hover:underline flex items-center">Ver <ChevronRight size={14}/></Link>
            </div>
            <div className="p-5 flex-1 flex flex-col gap-3">
              <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center border border-slate-100">
                <span className="text-sm font-bold text-slate-600">1. Cotizaciones Vivas</span>
                <span className="bg-blue-100 text-blue-800 font-black text-sm px-3 py-1 rounded-lg">45</span>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center border border-slate-100 ml-4">
                <span className="text-sm font-bold text-slate-600">2. Aprobadas (Ganadas)</span>
                <span className="bg-emerald-100 text-emerald-800 font-black text-sm px-3 py-1 rounded-lg">12</span>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center border border-amber-200 ml-8 relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400"></div>
                <span className="text-sm font-bold text-amber-700">3. Esperando Mercancía</span>
                <span className="bg-amber-100 text-amber-800 font-black text-sm px-3 py-1 rounded-lg">5</span>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center border border-slate-100 ml-12">
                <span className="text-sm font-bold text-slate-600">4. Despachadas</span>
                <span className="bg-slate-200 text-slate-800 font-black text-sm px-3 py-1 rounded-lg">7</span>
              </div>
            </div>
          </div>

          {/* Venta Inmediata (Retail/Stock) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Package className="text-purple-500" size={18} /> Inmediata (Stock)
              </h3>
              <Link href="/dashboard/inventario/entregas" className="text-xs font-bold text-purple-600 hover:underline flex items-center">Ver <ChevronRight size={14}/></Link>
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Top Movimientos Hoy</p>
                <ul className="space-y-4">
                  <li className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">#1</div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">Cinta Adhesiva Industrial</p>
                        <p className="text-xs font-medium text-slate-500">Stock actual: 120 ud</p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-emerald-600">-45 ud</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">#2</div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">Caja de Cartón Corrugado</p>
                        <p className="text-xs font-medium text-slate-500 text-red-500">Stock crítico: 12 ud</p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-emerald-600">-30 ud</span>
                  </li>
                </ul>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-500">Salidas Totales Hoy</span>
                <span className="text-lg font-black text-slate-800">142 Items</span>
              </div>
            </div>
          </div>

          {/* Leaderboard Asesores */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Users className="text-emerald-500" size={18} /> Desempeño Asesores
              </h3>
            </div>
            <div className="p-0 flex-1 flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-black">LG</div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center text-[10px] text-white shadow-sm">1</div>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Laura Gómez</p>
                    <p className="text-xs font-medium text-emerald-600">3 Cierres hoy</p>
                  </div>
                </div>
                <span className="font-black text-slate-800">$15,400</span>
              </div>
              
              <div className="flex items-center justify-between p-4 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-black">CR</div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Carlos Ruíz</p>
                    <p className="text-xs font-medium text-slate-500">1 Cierre hoy</p>
                  </div>
                </div>
                <span className="font-black text-slate-800">$8,200</span>
              </div>

              <div className="flex items-center justify-between p-4 hover:bg-slate-50 cursor-pointer transition-colors opacity-75">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-black">AM</div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Ana Martínez</p>
                    <p className="text-xs font-medium text-amber-500">5 Cotiz. estancadas</p>
                  </div>
                </div>
                <span className="font-black text-slate-800">$0</span>
              </div>
            </div>
          </div>

        </div>

        {/* 6. Live Tracking (Radar Logístico) */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-black text-slate-800 flex items-center gap-2">
              <Activity className="text-rose-500" size={18} /> Radar Logístico en Vivo (Top 3 Prioridades)
            </h3>
            <button className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1">Ver todo <ArrowRight size={14}/></button>
          </div>
          <div className="p-6">
            <div className="space-y-6">
              
              {/* Timeline Item 1 - Riesgo */}
              <div className="flex items-start gap-4 relative">
                <div className="absolute left-[19px] top-8 bottom-[-24px] w-0.5 bg-slate-100"></div>
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 border-4 border-white z-10">
                  <AlertTriangle size={16} />
                </div>
                <div className="flex-1 bg-red-50/50 border border-red-100 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-[10px] font-black uppercase text-red-500 tracking-wider">Demorado</span>
                      <h4 className="text-sm font-bold text-slate-800 mt-0.5">Pedido de Venta: PVEN-0042 (MegaCorp)</h4>
                    </div>
                    <span className="text-xs font-bold text-slate-500">Hace 2 horas</span>
                  </div>
                  <p className="text-sm text-slate-600 font-medium">El Pedido de Compra asociado (PEC-0089) fue retenido en aduana. El cliente espera entrega mañana. Requiere gestión inmediata.</p>
                </div>
              </div>

              {/* Timeline Item 2 - Transito */}
              <div className="flex items-start gap-4 relative">
                <div className="absolute left-[19px] top-8 bottom-[-24px] w-0.5 bg-slate-100"></div>
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 border-4 border-white z-10">
                  <Truck size={16} />
                </div>
                <div className="flex-1 bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-[10px] font-black uppercase text-amber-500 tracking-wider">En Tránsito (SLA Activo)</span>
                      <h4 className="text-sm font-bold text-slate-800 mt-0.5">Compra Importante: PEC-0091</h4>
                    </div>
                    <span className="text-xs font-bold text-slate-500">ETA: Hoy 4:00 PM</span>
                  </div>
                  <p className="text-sm text-slate-600 font-medium">Contenedor en ruta hacia almacén principal. Desbloqueará 4 Pedidos de Venta pausados.</p>
                </div>
              </div>

              {/* Timeline Item 3 - Exito */}
              <div className="flex items-start gap-4 relative">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 border-4 border-white z-10">
                  <CheckCircle2 size={16} />
                </div>
                <div className="flex-1 bg-white border border-slate-100 rounded-xl p-4 shadow-sm opacity-60 hover:opacity-100 transition-opacity">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-[10px] font-black uppercase text-emerald-500 tracking-wider">Entregado</span>
                      <h4 className="text-sm font-bold text-slate-800 mt-0.5">Venta Inmediata Mayorista #0992</h4>
                    </div>
                    <span className="text-xs font-bold text-slate-400">Hace 4 horas</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Dashboard rewritten as CEO Control Tower")
