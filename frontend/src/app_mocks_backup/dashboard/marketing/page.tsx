"use client";

import { 
  Megaphone, Network, Sparkles, Target, Users, 
  ArrowUpRight, BarChart3, TrendingUp, MousePointerClick, Eye
} from 'lucide-react';
import Link from 'next/link';

export default function MarketingDashboard() {

  const MODULES = [
    { name: 'Flujos (Redes Sociales)', desc: 'Automatización y flujos de contenido por red (Sin capas modales).', path: '/dashboard/marketing/flujos', icon: Network, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { name: 'Historias & Publicaciones', desc: 'Programación e historial de publicaciones e historias.', path: '/dashboard/marketing/historias', icon: Sparkles, color: 'text-purple-600 bg-purple-50 border-purple-200' },
    { name: 'Campañas', path: '/dashboard/marketing/campanas', desc: 'Definición integral de campañas de mercadeo y sus canales.', icon: Target, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { name: 'Visitantes & Leads', path: '/dashboard/marketing/visitantes', desc: 'Analítica de tráfico web, páginas visitadas y etiquetado CRM.', icon: Users, color: 'text-amber-600 bg-amber-50 border-amber-200' },
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
            Atrae, convierte y fideliza. Controla el contenido de tus redes sociales, el impacto de tus campañas y analiza el tráfico de tus visitantes web.
          </p>
        </div>
      </div>

      {/* KPIs Rápidos */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tráfico Web (Mes)</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800 flex items-center gap-2"><Eye size={24} className="text-blue-500"/> 24,500</h3>
          </div>
          <p className="text-xs font-bold text-emerald-500 flex items-center mt-2"><TrendingUp size={12} className="mr-1"/> +12.4% vs mes anterior</p>
        </div>
        
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Leads Capturados</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800">1,240</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Campañas Activas</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800">5</h3>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-80">Engagement Rate</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black">4.8%</h3>
          </div>
          <p className="text-xs font-medium opacity-80 mt-2 flex items-center gap-1"><MousePointerClick size={14}/> Interacciones globales</p>
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
