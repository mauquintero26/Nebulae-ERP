"use client";

import { useState } from 'react';
import Link from 'next/link';
import { 
  Target, BarChart3, Users, DollarSign, Plus, ArrowRight,
  TrendingUp, Calendar, Megaphone, CheckCircle2, ChevronRight
, ArrowLeft } from 'lucide-react';
import { ResizableHeader } from '@/components/ResizableHeader';

const MOCK_CAMPANAS = [
  { id: 'CMP-001', name: 'Black Friday 2026', canales: ['Email', 'Meta Ads', 'TikTok'], budget: 5000, leads: 1240, status: 'Activa', roi: '+240%' },
  { id: 'CMP-002', name: 'Lanzamiento Q3', canales: ['LinkedIn', 'Email'], budget: 2000, leads: 340, status: 'Pausada', roi: '+110%' },
  { id: 'CMP-003', name: 'Retargeting Carrito Abandonado', canales: ['Meta Ads'], budget: 800, leads: 85, status: 'Activa', roi: '+450%' }
];

export default function CampanasHub() {
  const [selectedCampana, setSelectedCampana] = useState(MOCK_CAMPANAS[0]);

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden animate-in fade-in">
      
      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div>
        <Link href="/dashboard/marketing" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors mb-2">
          <ArrowLeft size={16} /> Volver al Hub de Marketing
        </Link>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Target className="text-emerald-600" size={24} /> Campañas de Mercadeo
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Estructura objetivos, presupuesto y canales de distribución.</p>
        </div>
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-colors flex items-center gap-2">
          <Plus size={18} /> Nueva Campaña
        </button>
      </div>

      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* Left Column: List of Campaigns (Master) */}
        <div className="w-[450px] bg-white border-r border-slate-200 flex flex-col shadow-[5px_0_15px_-10px_rgba(0,0,0,0.05)] z-10 shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 uppercase text-xs tracking-wider">Campañas Recientes</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {MOCK_CAMPANAS.map(cmp => (
              <div 
                key={cmp.id}
                onClick={() => setSelectedCampana(cmp)}
                className={`p-5 border-b border-slate-100 cursor-pointer transition-colors ${selectedCampana.id === cmp.id ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-black text-slate-800 text-sm">{cmp.name}</h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${cmp.status === 'Activa' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {cmp.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-slate-500 mt-3">
                  <span className="flex items-center gap-1"><DollarSign size={12}/> {cmp.budget}</span>
                  <span className="flex items-center gap-1"><Users size={12}/> {cmp.leads} Leads</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Campaign Details (Detail) */}
        <div className="flex-1 bg-slate-50 overflow-y-auto custom-scrollbar">
          <div className="p-8 max-w-5xl mx-auto space-y-8">
            
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex justify-between items-start">
              <div>
                <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3 inline-block">
                  Campaña {selectedCampana.id}
                </span>
                <h2 className="text-3xl font-black text-slate-800">{selectedCampana.name}</h2>
                <div className="flex items-center gap-4 mt-4 text-sm font-medium text-slate-600">
                  <span className="flex items-center gap-1.5"><Calendar size={16} className="text-slate-400" /> 01 Nov - 30 Nov 2026</span>
                  <span className="flex items-center gap-1.5"><Megaphone size={16} className="text-slate-400" /> {selectedCampana.canales.join(', ')}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">ROI (Retorno)</p>
                <p className="text-4xl font-black text-emerald-600 flex items-center justify-end gap-2">
                  <TrendingUp size={28} /> {selectedCampana.roi}
                </p>
              </div>
            </div>

            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
              <BarChart3 className="text-emerald-600" size={20} /> Métricas de Desempeño
            </h3>
            
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Presupuesto Ejecutado</p>
                <p className="text-3xl font-black text-slate-800">${selectedCampana.budget}</p>
                <div className="w-full bg-slate-100 h-2 mt-4 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full w-[80%]"></div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Leads CRM Generados</p>
                <p className="text-3xl font-black text-slate-800">{selectedCampana.leads}</p>
                <p className="text-sm text-emerald-600 font-bold mt-2">Cost per Lead: ${(selectedCampana.budget / selectedCampana.leads).toFixed(2)}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ventas Atribuidas</p>
                <p className="text-3xl font-black text-slate-800">45</p>
                <p className="text-sm text-slate-500 font-bold mt-2">Conversion Rate: {((45 / selectedCampana.leads) * 100).toFixed(1)}%</p>
              </div>
            </div>

            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2 mt-8">
              <Target className="text-emerald-600" size={20} /> Audiencias y Segmentación
            </h3>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <CheckCircle2 className="text-emerald-500" size={20} />
                  <div>
                    <p className="font-bold text-slate-800 text-sm">Clientes Recurrentes (VIP)</p>
                    <p className="text-xs text-slate-500">Han comprado más de 3 veces en el último año.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <CheckCircle2 className="text-emerald-500" size={20} />
                  <div>
                    <p className="font-bold text-slate-800 text-sm">Carritos Abandonados (&gt; $100)</p>
                    <p className="text-xs text-slate-500">Dejaron productos en el checkout en los últimos 7 días.</p>
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
