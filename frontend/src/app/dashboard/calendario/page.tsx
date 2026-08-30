"use client";

import { useState } from 'react';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, 
  Settings, RefreshCw, Mail, CheckCircle2, User, Video, 
  MapPin, Clock, X
} from 'lucide-react';

const MOCK_EVENTS = [
  { id: 1, title: 'Presentación Flota Renting', client: 'Constructora Alfa', time: '10:00 AM', duration: '1h', type: 'video', day: 15 },
  { id: 2, title: 'Seguimiento Cotización', client: 'Carlos Mendoza', time: '02:30 PM', duration: '30m', type: 'call', day: 15 },
  { id: 3, title: 'Cierre de Negocio VIP', client: 'Laura Jiménez', time: '09:00 AM', duration: '45m', type: 'meeting', day: 18 }
];

export default function CalendarioPage() {
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const days = Array.from({ length: 35 }).map((_, i) => {
    const isCurrentMonth = i >= 1 && i <= 30;
    const dayNumber = isCurrentMonth ? i : (i === 0 ? 31 : i - 30);
    return {
      id: i,
      number: dayNumber,
      isCurrentMonth,
      isToday: i === 15
    };
  });

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-5 overflow-y-auto animate-in fade-in custom-scrollbar">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-purple-600">
            <CalendarIcon size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Calendario</h1>
            <p className="text-slate-500 text-sm mt-1">Gestiona tu disponibilidad y reuniones con clientes.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowSyncModal(true)}
            className={`border px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2 ${syncStatus ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            {syncStatus ? <CheckCircle2 size={16} /> : <RefreshCw size={16} />}
            {syncStatus ? 'Sincronizado' : 'Sincronizar Calendario'}
          </button>
          <button className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
            <Plus size={18} /> Nuevo Evento
          </button>
        </div>
      </div>

      <div className="flex gap-4 items-stretch flex-1 pb-4">
        
        {/* Left Column: Mini Calendar & Sync Status */}
        <div className="w-80 flex flex-col gap-4 flex-shrink-0 h-[800px]">
          
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">Estado de Sincronización</h3>
            {syncStatus ? (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3 items-start">
                <CheckCircle2 className="text-emerald-500 mt-0.5" size={18} />
                <div>
                  <h4 className="font-bold text-emerald-900 text-sm">{syncStatus}</h4>
                  <p className="text-xs text-emerald-700 mt-1">Última sinc: Hace 2 minutos</p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex gap-3 items-start">
                <CalendarIcon className="text-slate-400 mt-0.5" size={18} />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Calendario Interno</h4>
                  <p className="text-xs text-slate-500 mt-1 mb-3">No estás sincronizado con proveedores externos.</p>
                  <button onClick={() => setShowSyncModal(true)} className="text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-colors border border-purple-100 w-full text-center">
                    Configurar Sincronización
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-slate-800">Septiembre 2026</h3>
              <div className="flex gap-1">
                <button className="text-slate-400 hover:text-purple-600 hover:bg-purple-50 p-1 rounded-md transition-colors"><ChevronLeft size={18}/></button>
                <button className="text-slate-400 hover:text-purple-600 hover:bg-purple-50 p-1 rounded-md transition-colors"><ChevronRight size={18}/></button>
              </div>
            </div>
            
            <div className="grid grid-cols-7 gap-y-3 gap-x-1 text-center text-xs">
              {['L','M','X','J','V','S','D'].map((d, i) => (
                <div key={i} className="font-bold text-slate-400">{d}</div>
              ))}
              {days.map((day, i) => (
                <button 
                  key={i} 
                  className={`w-8 h-8 mx-auto rounded-full font-medium flex items-center justify-center transition-colors
                    ${day.isToday ? 'bg-purple-600 text-white shadow-md' : 
                      day.isCurrentMonth ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300'}`}
                >
                  {day.number}
                </button>
              ))}
            </div>
          </div>
          
          {/* Próximos Eventos is flex-1 so it stretches to fill the rest of the 800px column */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 flex-1 flex flex-col overflow-hidden">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4 flex-shrink-0">Próximos Eventos</h3>
            <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
              {MOCK_EVENTS.map(event => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center min-w-[40px]">
                    <span className="text-xs font-bold text-slate-800">{event.time.split(' ')[0]}</span>
                    <span className="text-[10px] font-bold text-slate-400">{event.time.split(' ')[1]}</span>
                  </div>
                  <div className={`flex-1 p-3 rounded-xl border-l-4 ${event.id === 1 ? 'border-l-indigo-500 bg-indigo-50/50' : 'border-l-purple-500 bg-purple-50/50'}`}>
                    <h4 className="font-bold text-slate-800 text-xs mb-1">{event.title}</h4>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1"><User size={10}/> {event.client}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Main Calendar Grid */}
        <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[800px]">
          
          {/* Main Grid Header */}
          <div className="h-16 border-b border-slate-100 flex justify-between items-center px-6 bg-slate-50/50 flex-shrink-0">
            <div className="flex items-center gap-4">
              <button className="bg-white border border-slate-200 text-slate-700 px-4 py-1.5 rounded-lg font-bold text-sm shadow-sm hover:bg-slate-50">
                Hoy
              </button>
              <div className="flex items-center gap-2">
                <button className="text-slate-400 hover:text-purple-600"><ChevronLeft size={20}/></button>
                <h2 className="text-xl font-bold text-slate-800 w-48 text-center">Septiembre 2026</h2>
                <button className="text-slate-400 hover:text-purple-600"><ChevronRight size={20}/></button>
              </div>
            </div>
            
            <div className="flex bg-slate-200/50 p-1 rounded-xl">
              <button className="px-4 py-1.5 text-sm font-bold text-slate-500 hover:text-slate-700">Día</button>
              <button className="px-4 py-1.5 text-sm font-bold text-slate-500 hover:text-slate-700">Semana</button>
              <button className="px-4 py-1.5 text-sm font-bold bg-white text-slate-800 rounded-lg shadow-sm">Mes</button>
            </div>
          </div>

          {/* Grid Layout (Mock Month) */}
          <div className="flex-1 flex flex-col">
            <div className="grid grid-cols-7 border-b border-slate-100 flex-shrink-0">
              {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(d => (
                <div key={d} className="py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">{d}</div>
              ))}
            </div>
            
            <div className="flex-1 grid grid-cols-7 grid-rows-5">
              {days.map((day, i) => (
                <div key={i} className={`border-r border-b border-slate-100 p-2 transition-colors hover:bg-slate-50 ${!day.isCurrentMonth ? 'bg-slate-50/50' : ''}`}>
                  <div className={`text-right mb-2`}>
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${day.isToday ? 'bg-purple-600 text-white shadow-md' : !day.isCurrentMonth ? 'text-slate-300' : 'text-slate-600'}`}>
                      {day.number}
                    </span>
                  </div>
                  
                  {MOCK_EVENTS.filter(e => e.day === day.number && day.isCurrentMonth).map(event => (
                    <div key={event.id} className="mb-1 p-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-[10px] cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all">
                      <p className="font-bold text-indigo-900 truncate">{event.time} - {event.title}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* SYNC MODAL */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
                  <RefreshCw size={20}/>
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg leading-tight">Sincronizar Calendario</h3>
                </div>
              </div>
              <button onClick={() => setShowSyncModal(false)} className="text-slate-400 hover:bg-slate-200 hover:text-slate-700 p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-sm font-medium text-slate-600 mb-6">Conecta tu proveedor de correo para sincronizar eventos bidireccionalmente. También puedes usar el calendario de forma interna nativa.</p>
              
              <div className="space-y-3">
                <button 
                  onClick={() => { setSyncStatus('Conectado a Google Workspace'); setShowSyncModal(false); }}
                  className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" className="w-6 h-6" />
                    <span className="font-bold text-slate-700">Google Calendar</span>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-800" />
                </button>

                <button 
                  onClick={() => { setSyncStatus('Conectado a Microsoft Outlook'); setShowSyncModal(false); }}
                  className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/d/df/Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg" alt="Microsoft" className="w-6 h-6" />
                    <span className="font-bold text-slate-700">Microsoft Outlook</span>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-800" />
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100">
                <button 
                  onClick={() => { setSyncStatus(null); setShowSyncModal(false); }}
                  className="w-full bg-white border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Usar solo Calendario Interno
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
