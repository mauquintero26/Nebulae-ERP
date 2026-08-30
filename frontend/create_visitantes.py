import os

path = 'src/app/dashboard/marketing/visitantes/page.tsx'
content = """"use client";

import { useState } from 'react';
import { 
  Users, Search, Filter, Globe, MousePointerClick, 
  MapPin, Clock, Tag, ExternalLink
} from 'lucide-react';
import { ResizableHeader } from '@/components/ResizableHeader';

const MOCK_VISITANTES = Array.from({ length: 15 }, (_, i) => {
  const num = i + 1;
  const isLead = num % 3 === 0;
  return { 
    id: `VIS-2026-${num.toString().padStart(4, '0')}`,
    ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
    country: num % 2 === 0 ? 'Colombia' : 'México',
    source: num % 4 === 0 ? 'SEO / Orgánico' : num % 3 === 0 ? 'Meta Ads (Campaña BF)' : 'Directo',
    pages: (num % 5) + 1,
    time: `${(num % 10) + 1}m ${(num * 12) % 60}s`,
    isLead,
    leadId: isLead ? `LEAD-00${num}` : null
  };
});

export default function VisitantesHub() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="w-full bg-slate-50 flex flex-col px-8 py-6 min-h-max animate-in fade-in">
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Users className="text-amber-600" size={28} /> Visitantes & Leads Web
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Analítica de tráfico, atribución de canales y generación de Leads CRM.</p>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Visitantes Hoy</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800">1,452</h3>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">Leads Convertidos</p>
          <h3 className="text-3xl font-black">84</h3>
          <p className="text-xs font-bold mt-2 opacity-90 text-amber-100">5.7% Conversion Rate</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tiempo Promedio</p>
          <h3 className="text-3xl font-black text-slate-800 flex items-center gap-2"><Clock size={24} className="text-blue-500"/> 3m 45s</h3>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Canal Principal</p>
          <h3 className="text-xl font-black text-slate-800 mt-2">SEO / Orgánico (45%)</h3>
        </div>
      </div>

      {/* Tabla Dinámica */}
      <div className="bg-white flex flex-col border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        
        <div className="flex justify-between items-center bg-white py-3 px-4 border-b border-slate-200">
          <div className="relative flex-1 max-w-md flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-amber-500 transition-all">
            <Search className="text-slate-400 shrink-0 mr-2" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por IP o ID..." 
              className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="w-full">
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                <ResizableHeader>Visitante ID / IP</ResizableHeader>
                <ResizableHeader>Ubicación</ResizableHeader>
                <ResizableHeader>Canal de Adquisición (Atribución)</ResizableHeader>
                <ResizableHeader>Páginas / Tiempo</ResizableHeader>
                <ResizableHeader>Estado CRM</ResizableHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {MOCK_VISITANTES.map((vis) => (
                <tr key={vis.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-black text-slate-800">{vis.id}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1">{vis.ip}</div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 font-bold text-slate-600">
                      <MapPin size={16} className="text-slate-400" /> {vis.country}
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 w-max">
                      <Tag size={12} /> {vis.source}
                    </span>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5"><MousePointerClick size={14} className="text-blue-500"/> {vis.pages} páginas</div>
                    <div className="text-xs font-medium text-slate-500 mt-1">{vis.time}</div>
                  </td>

                  <td className="px-6 py-4">
                    {vis.isLead ? (
                      <span className="flex items-center gap-1.5 text-emerald-600 font-black cursor-pointer hover:underline">
                        <Users size={16} /> Transformado ({vis.leadId}) <ExternalLink size={14} />
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium text-sm">Visitante Anónimo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
"""
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Visitantes page created")
