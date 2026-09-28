"use client";

import { useState, useEffect } from 'react';
import {
  Megaphone, Network, Sparkles, Target, Users,
  ArrowUpRight, BarChart3, TrendingUp, MousePointerClick,
  RefreshCw, DollarSign, CheckCircle2
} from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PageHeader, StatCard } from '@/components/ui';

const fCOP = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

export default function MarketingDashboard() {
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const loadStats = () => {
    setLoading(true);
    apiFetch('/marketing/stats')
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
      <div className="mb-10">
        <PageHeader icon={Megaphone} color="purple"
          title="Centro de Marketing & Crecimiento"
          subtitle="Campanas multicanal · Flujos automaticos · Historias & Publicaciones · Leads & Conversion"
          actions={(
            <button onClick={loadStats} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold text-sm shadow-sm">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Actualizar
            </button>
          )} />
      </div>

      <div className="grid grid-cols-4 gap-4 mb-10">
        <StatCard icon={Target} color="blue" label="Campanas Activas"
          value={loading ? '...' : (stats.campanas_activas ?? 0)}
          hint={loading ? '' : `${stats.campanas_total ?? 0} campanas totales`} />
        <StatCard icon={Users} color="emerald" label="Leads Capturados"
          value={loading ? '...' : (stats.leads_total ?? 0)}
          hint={loading ? '' : `${stats.leads_convertidos ?? 0} convertidos (${stats.tasa_conversion_pct ?? 0}%)`} />
        <StatCard icon={DollarSign} color="purple" label="Ventas Atribuidas"
          value={loading ? '...' : fCOP(stats.ventas_atribuidas_cop ?? 0)}
          hint={loading ? '' : `ROI: ${stats.roi_pct ?? 0}%`} />
        <StatCard variant="gradient" color="purple" icon={Sparkles} label="Flujos Activos"
          value={loading ? '...' : (stats.flujos_activos ?? 0)}
          hint={loading ? '' : `${stats.posts_total ?? 0} posts publicados`} />
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