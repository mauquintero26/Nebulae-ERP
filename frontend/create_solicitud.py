import os

os.makedirs('src/app/dashboard/ventas/solicitud', exist_ok=True)

content = """"use client";

import { useState } from 'react';
import { 
  FileText, Search, Filter, Plus, AlertCircle, 
  Clock, CheckCircle2, MessageSquareWarning, 
  ArrowUpRight, ArrowDownRight, MoreVertical
} from 'lucide-react';

const MOCK_SOLICITUDES = [
  { id: 'SC-0001', cliente: 'Juan Pérez', tipo: 'Cotización', estado: 'Nuevo', ultimaAct: 'Hace 2 horas', responsable: 'Ana Gómez', desatendida: false },
  { id: 'SC-0002', cliente: 'María López', tipo: 'Soporte', estado: 'En Proceso', ultimaAct: 'Hace 3 días', responsable: 'Carlos Ruiz', desatendida: true },
  { id: 'SC-0003', cliente: 'Empresa XYZ', tipo: 'Información', estado: 'Nuevo', ultimaAct: 'Hace 5 días', responsable: 'Sin Asignar', desatendida: true },
  { id: 'SC-0004', cliente: 'Luis Torres', tipo: 'Devolución', estado: 'Esperando Cliente', ultimaAct: 'Hace 1 día', responsable: 'Ana Gómez', desatendida: false },
  { id: 'SC-0005', cliente: 'Tech Solutions SAS', tipo: 'Cotización', estado: 'En Proceso', ultimaAct: 'Hace 4 horas', responsable: 'Carlos Ruiz', desatendida: false },
];

export default function SolicitudesClientePage() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-5 overflow-y-auto animate-in fade-in custom-scrollbar">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-purple-600">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Solicitudes de Cliente</h1>
            <p className="text-slate-500 text-sm mt-1">Bandeja centralizada para cualquier tipo de requerimiento del cliente.</p>
          </div>
        </div>
        
        <button className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
          <Plus size={18} /> Nueva Solicitud
        </button>
      </div>

      {/* Alertas Críticas (Desatendidas) */}
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-6 flex items-start gap-4">
        <div className="bg-rose-100 text-rose-600 p-2 rounded-full shrink-0 mt-0.5">
          <MessageSquareWarning size={20} />
        </div>
        <div className="flex-1">
          <h3 className="font-black text-rose-800 text-sm">¡Alerta de SLAs Incumplidos!</h3>
          <p className="text-rose-600 text-sm mt-1">Tienes <strong>2 solicitudes</strong> (SC-0002, SC-0003) que han superado los 2 días sin cambio de estado o atención. Requieren acción inmediata.</p>
        </div>
        <button className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm">
          Ver Desatendidas
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><FileText size={48} /></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Solicitudes Activas</p>
          <h3 className="text-3xl font-black text-slate-800">48</h3>
          <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1"><ArrowUpRight size={14}/> +5 hoy</p>
        </div>

        <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-black"><AlertCircle size={48} /></div>
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">Desatendidas (> 2 días)</p>
          <h3 className="text-3xl font-black">2</h3>
          <p className="text-xs font-bold mt-2 opacity-90">Requieren escalamiento</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Clock size={48} /></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">TMO (Tiempo Medio Op.)</p>
          <h3 className="text-3xl font-black text-slate-800">4.5h</h3>
          <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1"><ArrowDownRight size={14}/> -1h vs semana ant.</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><CheckCircle2 size={48} /></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tasa de Resolución</p>
          <h3 className="text-3xl font-black text-slate-800">92%</h3>
          <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1"><ArrowUpRight size={14}/> +3% vs semana ant.</p>
        </div>
      </div>

      {/* Tabla Central */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input type="text" placeholder="Buscar por ID, Cliente o Tipo..." className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm w-80 outline-none focus:border-purple-600" />
            </div>
            <button className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 flex items-center gap-2 text-sm font-medium">
              <Filter size={16} /> Filtros
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Mostrando</span>
            <span className="font-bold text-slate-800">5 de 48</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4 font-bold">ID Solicitud</th>
                <th className="px-6 py-4 font-bold">Cliente</th>
                <th className="px-6 py-4 font-bold">Tipo</th>
                <th className="px-6 py-4 font-bold">Estado</th>
                <th className="px-6 py-4 font-bold">Última Act.</th>
                <th className="px-6 py-4 font-bold">Responsable</th>
                <th className="px-6 py-4 font-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {MOCK_SOLICITUDES.map(sol => (
                <tr key={sol.id} className={`hover:bg-slate-50 transition-colors ${sol.desatendida ? 'bg-rose-50/30' : ''}`}>
                  <td className="px-6 py-4 font-black text-slate-800">{sol.id}</td>
                  <td className="px-6 py-4 font-bold text-slate-700">{sol.cliente}</td>
                  <td className="px-6 py-4 text-slate-600">
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold border border-slate-200">
                      {sol.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                      sol.estado === 'Nuevo' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      sol.estado === 'En Proceso' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-slate-50 text-slate-700 border-slate-200'
                    }`}>
                      {sol.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${sol.desatendida ? 'text-rose-600' : 'text-slate-500'}`}>{sol.ultimaAct}</span>
                      {sol.desatendida && <AlertCircle size={14} className="text-rose-500" title="Atención requerida" />}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 border border-slate-300">
                        {sol.responsable.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="text-slate-600 font-medium text-xs">{sol.responsable}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-slate-400 hover:text-purple-600 transition-colors">
                      <MoreVertical size={18} />
                    </button>
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

with open('src/app/dashboard/ventas/solicitud/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Solicitud de Cliente page created successfully")
