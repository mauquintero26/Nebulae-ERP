"use client";

import { 
  Puzzle, Webhook, Bot, Activity, CheckCircle2, AlertTriangle, Link as LinkIcon, Lock
} from 'lucide-react';
import Link from 'next/link';

export default function IntegracionesHub() {
  const MODULES = [
    { name: 'APIs & Webhooks', desc: 'Gestiona conexiones con terceros, llaves API y endpoints.', path: '/dashboard/integraciones/apis', icon: Webhook, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { name: 'MCP Agents (IA)', desc: 'Servidores Model Context Protocol y Agentes Autónomos.', path: '/dashboard/integraciones/mcp', icon: Bot, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  ];

  const ACTIVE_INTEGRATIONS = [
    { name: 'WhatsApp Business', type: 'API Oficial', status: 'healthy', icon: '💬' },
    { name: 'Instagram Graph API', type: 'API Meta', status: 'healthy', icon: '📸' },
    { name: 'Facebook Pages', type: 'API Meta', status: 'healthy', icon: '📘' },
    { name: 'Stripe Payments', type: 'Webhook', status: 'warning', icon: '💳' },
  ];

  return (
    <div className="w-full bg-slate-50 flex flex-col px-8 py-8 min-h-max animate-in fade-in custom-scrollbar">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <div className="bg-slate-800 text-white p-2 rounded-xl shadow-sm"><Puzzle size={24} /></div>
            Centro de Integraciones
          </h1>
          <p className="text-slate-500 mt-2 font-medium max-w-2xl">
            Conecta Nebulae con el mundo exterior. Centraliza y orquesta APIs de terceros, Webhooks y Agentes de Inteligencia Artificial (MCP).
          </p>
        </div>
      </div>

      {/* KPIs Rápidos */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Conexiones Activas</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800 flex items-center gap-2"><LinkIcon size={24} className="text-blue-500"/> 12</h3>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Peticiones (Últ. 24h)</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800">45.2K</h3>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">Webhooks Procesados</p>
          <h3 className="text-3xl font-black">99.8%</h3>
          <p className="text-xs font-bold mt-2 opacity-90 text-emerald-100 flex items-center gap-1"><CheckCircle2 size={14}/> Success Rate</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Seguridad</p>
          <h3 className="text-xl font-black text-slate-800 mt-2 flex items-center gap-2"><Lock size={18} className="text-emerald-500"/> Encriptado Extremo</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Sub-Módulos */}
        <div className="lg:col-span-2">
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
            Gestión Técnica
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {MODULES.map((mod, idx) => (
              <Link key={idx} href={mod.path} className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer relative overflow-hidden flex flex-col">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 border transition-transform group-hover:scale-110 ${mod.color}`}>
                  <mod.icon size={24} />
                </div>
                <h3 className="text-lg font-black text-slate-800 mb-2 group-hover:text-slate-900">{mod.name}</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed flex-1">{mod.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Ecosistema Actual */}
        <div className="lg:col-span-1">
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
            <Activity className="text-slate-400" size={20} /> Ecosistema Activo
          </h2>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            {ACTIVE_INTEGRATIONS.map((int, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{int.icon}</span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{int.name}</h4>
                    <p className="text-xs font-medium text-slate-500">{int.type}</p>
                  </div>
                </div>
                {int.status === 'healthy' ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] flex items-center justify-center relative group cursor-help">
                    <AlertTriangle size={12} className="absolute opacity-0 group-hover:opacity-100 text-amber-600 scale-150 transition-opacity" />
                  </div>
                )}
              </div>
            ))}
            <button className="w-full py-3 mt-2 border-2 border-dashed border-slate-200 text-slate-500 font-bold rounded-xl text-sm hover:border-blue-500 hover:text-blue-600 transition-colors">
              Explorar Directorio de Apps
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
