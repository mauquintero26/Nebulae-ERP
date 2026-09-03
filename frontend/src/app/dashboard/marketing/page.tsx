"use client";

import { useState, useEffect } from 'react';
import {
  Megaphone, Network, Sparkles, Target, Users,
  ArrowUpRight, BarChart3, TrendingUp, MousePointerClick,
  RefreshCw, DollarSign, CheckCircle2
} from 'lucide-react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';
const fCOP = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

export default function MarketingDashboard() {
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const loadStats = () => {
    setLoading(true);
    fetch(`${API}/marketing/stats`, { headers: { 'Content-Type': 'application/json' } })
      .then(r => r.json())
      .then(d => { setStats(d.data || {}); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStats(); }, []);

  const MODULES = [
    { name: 'Flujos (Redes Sociales)', desc: 'Automatizacion por keyword: Instagram, WhatsApp, Facebook, Email.', path: '/dashboard/marketing/flujos', icon: Network, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { name: 'Historias & Publicaciones', desc: 'Disena con preview de telefono, programa y publica en redes.', path: '/dashboard/marketing/historias', icon: Sparkles, color: 'text-purple-600 bg-purple-50 border-purple-200' },
    { name: 'Campanas', path: '/dashboard/marketing/campanas', desc: 'Crea, lanza y mide campanas multicanal con codigo de descuento.', icon: Target, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { name: 'Visitantes & Leads', path: '/dashboard/marketing/visitantes', desc: 'Analitica de trafico web, paginas visitadas y etiquetado CRM.', icon: Users, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  ];

  return (
    <div className="w-full bg-slate-50 flex flex-col px-8 py-8 min-h-max animate-in fade-in custom-scrollbar">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <div className="bg-slate-800 text-white p-2 rounded-xl shadow-sm"><Megaphone size={24} /></div>
            Centro de Marketing & Crecimiento
          </h1>
          <p className="text-slate-500 mt-2 font-medium max-w-2xl">
            Campanas multicanal · Flujos automaticos · Historias & Publicaciones · Leads & Conversion
          </p>
        </div>
        <button onClick={loadStats} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold text-sm shadow-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-10">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="inline-flex p-2 rounded-xl bg-blue-100 text-blue-700 mb-3"><Target size={18}/></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Campanas Activas</p>
          <h3 className="text-3xl font-black text-slate-800">{loading ? '...' : (stats.campanas_activas ?? 0)}</h3>
          <p className="text-xs font-bold text-slate-400 mt-1">{loading ? '' : `${stats.campanas_total ?? 0} campanas totales`}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="inline-flex p-2 rounded-xl bg-emerald-100 text-emerald-700 mb-3"><Users size={18}/></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Leads Capturados</p>
          <h3 className="text-3xl font-black text-slate-800">{loading ? '...' : (stats.leads_total ?? 0)}</h3>
          <p className="text-xs font-bold text-emerald-500 mt-1 flex items-center gap-1">
            <CheckCircle2 size={11}/> {loading ? '' : `${stats.leads_convertidos ?? 0} convertidos (${stats.tasa_conversion_pct ?? 0}%)`}
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="inline-flex p-2 rounded-xl bg-purple-100 text-purple-700 mb-3"><DollarSign size={18}/></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ventas Atribuidas</p>
          <h3 className="text-2xl font-black text-slate-800">{loading ? '...' : fCOP(stats.ventas_atribuidas_cop ?? 0)}</h3>
          <p className="text-xs font-bold text-purple-500 mt-1 flex items-center gap-1">
            <TrendingUp size={11}/> {loading ? '' : `ROI: ${stats.roi_pct ?? 0}%`}
          </p>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-5 rounded-2xl shadow-sm text-white">
          <div className="inline-flex p-2 rounded-xl bg-white/20 mb-3"><Sparkles size={18}/></div>
          <p className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">Flujos Activos</p>
          <h3 className="text-3xl font-black">{loading ? '...' : (stats.flujos_activos ?? 0)}</h3>
          <p className="text-xs font-medium opacity-80 mt-1 flex items-center gap-1">
            <MousePointerClick size={14}/> {loading ? '' : `${stats.posts_total ?? 0} posts publicados`}
          </p>
        </div>
      </div>

      <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
        <BarChart3 className="text-slate-400" size={20} /> Entornos de Marketing
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 pb-10">
        {MODULES.map((mod, idx) => (
          <Link key={idx} href={mod.path} className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer relative overflow-hidden flex flex-col">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 border transition-transform group-hover:scale-110 ${mod.color}`}>
              <mod.icon size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2 group-hover:text-slate-900">{mod.name}</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed flex-1">{mod.desc}</p>
            <div className="absolute top-6 right-6 text-slate-300 group-hover:text-slate-800 transition-colors">
              <ArrowUpRight size={20} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}