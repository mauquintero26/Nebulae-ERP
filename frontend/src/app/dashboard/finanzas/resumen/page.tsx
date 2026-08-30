"use client";

import { TrendingUp, TrendingDown, DollarSign, Activity, AlertTriangle, ArrowRight } from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

export default function ResumenFinancieroPage() {
  const barData = {
    labels: ['Ago 15', 'Ago 16', 'Ago 17', 'Ago 18', 'Ago 19', 'Ago 20', 'Ago 21'],
    datasets: [
      {
        label: 'Ingresos',
        data: [1200, 1900, 1500, 2200, 1800, 2500, 2100],
        backgroundColor: '#10b981', // emerald-500
        borderRadius: 4,
      },
      {
        label: 'Egresos (COGS + OPEX)',
        data: [800, 1100, 900, 1300, 1000, 1400, 1200],
        backgroundColor: '#f43f5e', // rose-500
        borderRadius: 4,
      }
    ]
  };

  const doughnutData = {
    labels: ['Nómina', 'Arriendo', 'Pauta Digital', 'Suscripciones'],
    datasets: [{
      data: [4500, 2800, 1200, 150],
      backgroundColor: ['#3b82f6', '#6366f1', '#f43f5e', '#8b5cf6'],
      borderWidth: 0,
    }]
  };

  return (
    <div className="p-8 h-full overflow-y-auto space-y-6 animate-in fade-in duration-500 custom-scrollbar bg-slate-50">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <div className="p-2 bg-blue-600 text-white rounded-lg shadow-md shadow-blue-200">
            <Activity size={24} />
          </div>
          Dashboard P&L (Pérdidas y Ganancias)
        </h1>
        <p className="text-slate-500 mt-1">Visión financiera global, márgenes de utilidad y alertas del CFO Virtual.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Main P&L Content */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Cascada (Waterfall) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Ingresos Brutos</p>
              <h3 className="text-2xl font-black text-slate-800">$45,200</h3>
              <p className="text-xs font-medium text-emerald-600 mt-1">Total Ventas</p>
            </div>
            
            <div className="flex items-center justify-center -mx-2 z-10 text-slate-400 font-bold hidden md:flex">➖</div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500"></div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Costo Ventas (COGS)</p>
              <h3 className="text-2xl font-black text-slate-800">$18,500</h3>
              <p className="text-xs font-medium text-rose-600 mt-1">Costo mercancía</p>
            </div>

            <div className="flex items-center justify-center -mx-2 z-10 text-slate-400 font-bold hidden md:flex">🟰</div>

            <div className="bg-slate-800 p-5 rounded-2xl shadow-md text-white">
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Utilidad Bruta</p>
              <h3 className="text-2xl font-black">$26,700</h3>
              <p className="text-xs font-medium text-emerald-400 mt-1">Margen: 59%</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-start-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Gastos (OPEX)</p>
              <h3 className="text-2xl font-black text-slate-800">$8,735</h3>
              <p className="text-xs font-medium text-amber-600 mt-1">Fijos y Variables</p>
            </div>
            
            <div className="bg-emerald-600 p-5 rounded-2xl shadow-md text-white relative overflow-hidden">
              <div className="absolute right-0 bottom-0 opacity-10">
                <DollarSign size={80} />
              </div>
              <p className="text-xs font-bold text-emerald-100 uppercase tracking-wider mb-1">Utilidad Neta</p>
              <h3 className="text-3xl font-black">$17,965</h3>
              <p className="text-xs font-bold text-emerald-200 mt-1">Margen Neto: 39%</p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Ingresos vs Egresos (Últimos 7 días)</h3>
              <div className="h-48">
                <Bar data={barData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} />
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Distribución OPEX</h3>
              <div className="h-48 flex justify-center">
                <Doughnut data={doughnutData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }} />
              </div>
            </div>
          </div>

        </div>

        {/* CFO Virtual Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900 rounded-2xl shadow-xl overflow-hidden flex flex-col h-full border border-slate-800">
            <div className="p-6 bg-gradient-to-r from-blue-900 to-slate-900 border-b border-slate-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                  <span className="text-xl">🤖</span>
                </div>
                <div>
                  <h3 className="text-white font-extrabold text-lg">CFO Virtual</h3>
                  <p className="text-blue-300 text-xs font-medium">Análisis Financiero IA</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-4 flex-1">
              
              <div className="bg-slate-800/50 p-4 rounded-xl border border-rose-500/20">
                <div className="flex gap-3">
                  <AlertTriangle size={18} className="text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-rose-300 mb-1">Anomalía en Pauta Digital</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">El gasto en Meta Ads incrementó un <span className="text-rose-300 font-bold">15%</span> esta semana, pero el volumen de Leads Frescos en el CRM bajó un 4%. Sugiero pausar la campaña "Agosto_Promo".</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 p-4 rounded-xl border border-emerald-500/20">
                <div className="flex gap-3">
                  <TrendingUp size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-300 mb-1">Proyección de Flujo de Caja</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">Basado en las ventas actuales ($45K), la nómina y los arriendos del mes ($7.3K) ya están cubiertos al <span className="text-emerald-300 font-bold">100%</span>. El punto de equilibrio fue superado ayer.</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 p-4 rounded-xl border border-blue-500/20">
                <div className="flex gap-3">
                  <DollarSign size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-blue-300 mb-1">Rentabilidad por Categoría</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">La categoría "Accesorios" tiene el mejor margen bruto (72%). Sugiero priorizar las Órdenes de Compra de esta categoría para fin de año.</p>
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
