"use client";

import { Calendar as CalendarIcon, Truck, MapPin, Search, Filter, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

const LOGISTICS_EVENTS = [
  { id: 'L-1', date: 'Hoy, 09:00 AM', status: 'Llegan Hoy', title: 'Entrega PO-2026-0802', supplier: 'Textiles S.A.', items: 500, color: 'bg-amber-100 text-amber-800 border-amber-300', icon: <Truck size={18} /> },
  { id: 'L-2', date: 'Ayer, 06:00 PM', status: 'Retrasado', title: 'Llegada a Puerto PO-0798', supplier: 'Shenzhen Tech', items: 1200, color: 'bg-rose-100 text-rose-800 border-rose-300', icon: <AlertTriangle size={18} /> },
  { id: 'L-3', date: 'Mañana, 02:00 PM', status: 'Por Venir', title: 'Despacho Nacional P-45', supplier: 'Logística Local', items: 50, color: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: <MapPin size={18} /> },
  { id: 'L-4', date: '28 Ago', status: 'Por Venir', title: 'Entrega PO-2026-0803', supplier: 'LG Electronics', items: 50, color: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: <CheckCircle2 size={18} /> },
];

export default function LogisticsCalendarPage() {
  return (
    <div className="p-8 h-full overflow-y-auto space-y-6 animate-in fade-in duration-500 custom-scrollbar bg-slate-50">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-amber-600 text-white rounded-lg shadow-md shadow-amber-200">
              <CalendarIcon size={24} />
            </div>
            Calendario Logístico
          </h1>
          <p className="text-slate-500 mt-1">Monitorea los tiempos de tránsito, arribos y retrasos de mercancía.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <button className="p-1 hover:bg-slate-100 rounded-lg text-slate-600"><ChevronLeft size={20}/></button>
            <span className="font-bold text-slate-800 px-4">Esta Semana</span>
            <button className="p-1 hover:bg-slate-100 rounded-lg text-slate-600"><ChevronRight size={20}/></button>
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors">
            <Filter size={16} /> Filtros
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Panel de Estado General */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-slate-800 mb-4">Estado de Importaciones</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-rose-50 rounded-xl border border-rose-100">
                <div className="flex items-center gap-2 text-rose-700 font-bold">
                  <AlertTriangle size={18} /> Pedidos Retrasados
                </div>
                <span className="bg-white px-2 py-1 rounded-md text-rose-700 font-black shadow-sm">1</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-amber-50 rounded-xl border border-amber-100">
                <div className="flex items-center gap-2 text-amber-700 font-bold">
                  <Truck size={18} /> Llegan Hoy
                </div>
                <span className="bg-white px-2 py-1 rounded-md text-amber-700 font-black shadow-sm">1</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <MapPin size={18} /> Por Venir (Esta sem)
                </div>
                <span className="bg-white px-2 py-1 rounded-md text-emerald-700 font-black shadow-sm">2</span>
              </div>
            </div>
          </div>
        </div>

        {/* Lista de Agenda Logística */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 min-h-[500px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800 text-lg">Agenda de Entregas</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Buscar Orden / PO..." 
                className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none w-56"
              />
            </div>
          </div>

          <div className="space-y-4 relative">
            {/* Timeline Line */}
            <div className="absolute left-[7px] top-4 bottom-4 w-0.5 bg-slate-100 z-0"></div>

            {LOGISTICS_EVENTS.map(ev => (
              <div key={ev.id} className="relative z-10 flex gap-4">
                {/* Timeline Dot */}
                <div className={`mt-1.5 w-4 h-4 rounded-full border-4 border-white flex-shrink-0 ${
                  ev.status === 'Retrasado' ? 'bg-rose-500' :
                  ev.status === 'Llegan Hoy' ? 'bg-amber-500 animate-pulse' :
                  'bg-emerald-500'
                }`}></div>
                
                {/* Card */}
                <div className={`flex-1 p-4 rounded-xl border-l-4 shadow-sm transition-transform hover:-translate-y-0.5 ${ev.color}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-white/50 p-1.5 rounded-lg">{ev.icon}</span>
                      <span className="font-black text-sm uppercase tracking-wider">{ev.status}</span>
                    </div>
                    <span className="text-xs font-bold bg-white/60 px-2 py-1 rounded-md">{ev.date}</span>
                  </div>
                  
                  <h4 className="font-extrabold text-lg leading-tight mb-1">{ev.title}</h4>
                  <p className="font-medium opacity-90 mb-3">Proveedor: {ev.supplier}</p>
                  
                  <div className="flex items-center justify-between border-t border-black/10 pt-3">
                    <span className="text-sm font-bold opacity-80">{ev.items} Unidades esperadas</span>
                    <button className="text-xs font-bold bg-white px-3 py-1.5 rounded-lg shadow-sm hover:shadow transition-shadow">
                      Ver Orden de Compra
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
