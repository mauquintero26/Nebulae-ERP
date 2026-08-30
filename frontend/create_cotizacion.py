import os

os.makedirs('src/app/dashboard/ventas/cotizacion', exist_ok=True)

content = """"use client";

import { useState } from 'react';
import { 
  FileSignature, Search, Filter, Plus, AlertCircle, 
  Clock, CheckCircle2, MessageSquareWarning, 
  ArrowUpRight, ArrowDownRight, MoreVertical,
  List, LayoutGrid, Calendar, PieChart, ChevronDown, X,
  Trash2, Edit, CheckSquare, Send
} from 'lucide-react';

const MOCK_COTIZACIONES = [
  { id: 'COT-0001', cliente: 'Tech Solutions SAS', monto: '$12,500.00', estado: 'Cotización Confirmada', ultimaAct: 'Hace 2 horas', responsable: 'Ana Gómez', desatendida: false },
  { id: 'COT-0002', cliente: 'Constructora Alfa', monto: 'A definir', estado: 'Pendiente por Cotizar', ultimaAct: 'Hace 3 días', responsable: 'Carlos Ruiz', desatendida: true },
  { id: 'COT-0003', cliente: 'Inversiones XYZ', monto: '$4,800.00', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 5 días', responsable: 'Ana Gómez', desatendida: true },
  { id: 'COT-0004', cliente: 'Global Imports', monto: '$2,100.00', estado: 'Pendiente por Cotizar', ultimaAct: 'Hace 1 día', responsable: 'Sin Asignar', desatendida: false },
  { id: 'COT-0005', cliente: 'Hotel Paraíso', monto: '$8,950.00', estado: 'Cotización Confirmada', ultimaAct: 'Hace 4 horas', responsable: 'Carlos Ruiz', desatendida: false },
];

export default function CotizacionesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState('list');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const toggleRow = (id: string) => {
    if (selectedRows.includes(id)) {
      setSelectedRows(selectedRows.filter(rowId => rowId !== id));
    } else {
      setSelectedRows([...selectedRows, id]);
    }
  };

  const toggleAll = () => {
    if (selectedRows.length === MOCK_COTIZACIONES.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(MOCK_COTIZACIONES.map(s => s.id));
    }
  };

  const alertas = MOCK_COTIZACIONES.filter(c => c.desatendida);

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-5 overflow-y-auto animate-in fade-in custom-scrollbar">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-purple-600">
            <FileSignature size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Cotizaciones</h1>
            <p className="text-slate-500 text-sm mt-1">Gestión y seguimiento de propuestas comerciales.</p>
          </div>
        </div>
        
        <button className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
          <Plus size={18} /> Nueva Cotización
        </button>
      </div>

      {/* Alertas Críticas */}
      {alertas.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-6 flex items-start gap-4 shadow-sm">
          <div className="bg-rose-100 text-rose-600 p-2 rounded-full shrink-0 mt-0.5">
            <MessageSquareWarning size={20} />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-rose-800 text-sm">¡Alerta de Seguimiento!</h3>
            <p className="text-rose-600 text-sm mt-1">
              Tienes <strong>{alertas.length} cotizaciones</strong> ({alertas.map(a => a.id).join(', ')}) que superan los 2 días sin atención (pendientes de armar o esperando respuesta del cliente).
            </p>
          </div>
          <button className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm">
            Atender Ahora
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><FileSignature size={48} /></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Activas</p>
          <h3 className="text-3xl font-black text-slate-800">124</h3>
          <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1"><ArrowUpRight size={14}/> +12 este mes</p>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-black"><Clock size={48} /></div>
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">Pendientes por Cotizar</p>
          <h3 className="text-3xl font-black">15</h3>
          <p className="text-xs font-bold mt-2 opacity-90 text-amber-100">Requieren elaboración</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><AlertCircle size={48} /></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Esperando Confirmación</p>
          <h3 className="text-3xl font-black text-slate-800">42</h3>
          <p className="text-xs font-bold text-slate-400 mt-2 flex items-center gap-1">Cotizaciones enviadas</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><CheckCircle2 size={48} /></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tasa de Cierre</p>
          <h3 className="text-3xl font-black text-slate-800">38%</h3>
          <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1"><ArrowUpRight size={14}/> +5% vs mes anterior</p>
        </div>
      </div>

      {/* Controles de Búsqueda Avanzada y Vistas */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-3 rounded-t-3xl shadow-sm border border-slate-200 border-b-0">
        
        {/* Buscador Avanzado (Izquierda) */}
        <div className="flex-1 flex items-center gap-3 w-full">
          <div className="relative flex-1 max-w-2xl flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500 transition-all">
            <Search className="text-slate-400 mr-2 shrink-0" size={18} />
            
            {/* Filter Pills */}
            <div className="flex items-center gap-1 mr-2 shrink-0">
              <span className="flex items-center gap-1 bg-white border border-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-md shadow-sm">
                Estado: Desatendidas <button className="hover:text-red-500"><X size={12}/></button>
              </span>
            </div>
            
            <input 
              type="text" 
              placeholder="Buscar por ID (Ej. COT-0001), Cliente, Monto..." 
              className="bg-transparent border-none outline-none text-sm w-full font-medium text-slate-700 placeholder-slate-400"
            />
          </div>
          
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm shrink-0">
            <Filter size={16} /> Filtros <ChevronDown size={14} />
          </button>
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm shrink-0">
            Agrupar Por <ChevronDown size={14} />
          </button>
        </div>

        {/* Vistas (Derecha) */}
        <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
          <button 
            onClick={() => setActiveView('list')}
            className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeView === 'list' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            title="Vista de Lista"
          >
            <List size={18} />
          </button>
          <button 
            onClick={() => setActiveView('kanban')}
            className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeView === 'kanban' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            title="Kanban de Cotizaciones"
          >
            <LayoutGrid size={18} />
          </button>
          <button 
            onClick={() => setActiveView('calendar')}
            className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeView === 'calendar' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            title="Vencimientos de Cotizaciones"
          >
            <Calendar size={18} />
          </button>
          <button 
            onClick={() => setActiveView('analysis')}
            className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeView === 'analysis' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            title="Análisis (Tabla Dinámica)"
          >
            <PieChart size={18} />
          </button>
        </div>
      </div>

      {/* Área Principal de Contenido (Depende de activeView) */}
      <div className="bg-white rounded-b-3xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
        
        {/* Barra de Acciones Múltiples (Aparece si hay checkboxes seleccionados) */}
        {selectedRows.length > 0 && activeView === 'list' && (
          <div className="bg-purple-50 px-6 py-3 flex items-center justify-between border-b border-purple-100 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <span className="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-md">{selectedRows.length}</span>
              <span className="text-sm font-bold text-purple-900">Cotizaciones seleccionadas</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 bg-white border border-purple-200 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                <Send size={14} /> Enviar Recordatorio
              </button>
              <button className="flex items-center gap-2 bg-white border border-purple-200 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                <CheckSquare size={14} /> Marcar Confirmadas
              </button>
              <button className="flex items-center gap-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-2">
                <Trash2 size={14} /> Anular
              </button>
            </div>
          </div>
        )}

        {activeView === 'list' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                  <th className="px-6 py-4 font-bold w-12">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer w-4 h-4"
                      checked={selectedRows.length === MOCK_COTIZACIONES.length && MOCK_COTIZACIONES.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-6 py-4 font-bold">ID Cotización</th>
                  <th className="px-6 py-4 font-bold">Cliente</th>
                  <th className="px-6 py-4 font-bold">Monto</th>
                  <th className="px-6 py-4 font-bold">Estado</th>
                  <th className="px-6 py-4 font-bold">Última Act.</th>
                  <th className="px-6 py-4 font-bold">Responsable</th>
                  <th className="px-6 py-4 font-bold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {MOCK_COTIZACIONES.map(cot => {
                  const isSelected = selectedRows.includes(cot.id);
                  return (
                    <tr key={cot.id} className={`transition-colors ${isSelected ? 'bg-purple-50/50' : cot.desatendida ? 'bg-rose-50/30 hover:bg-rose-50/50' : 'hover:bg-slate-50'}`}>
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer w-4 h-4"
                          checked={isSelected}
                          onChange={() => toggleRow(cot.id)}
                        />
                      </td>
                      <td className="px-6 py-4 font-black text-slate-800">{cot.id}</td>
                      <td className="px-6 py-4 font-bold text-slate-700">{cot.cliente}</td>
                      <td className="px-6 py-4 font-black text-slate-800">{cot.monto}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                          cot.estado === 'Pendiente por Cotizar' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          cot.estado === 'Cotizado - Pendiente Conf.' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {cot.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${cot.desatendida ? 'text-rose-600' : 'text-slate-500'}`}>{cot.ultimaAct}</span>
                          {cot.desatendida && <AlertCircle size={14} className="text-rose-500" title="Atención requerida" />}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 border border-slate-300">
                            {cot.responsable.split(' ').map(n => n[0]).join('')}
                          </div>
                          <span className="text-slate-600 font-medium text-xs">{cot.responsable}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-slate-400 hover:text-purple-600 transition-colors">
                          <MoreVertical size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Placeholder para otras vistas */}
        {activeView !== 'list' && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            {activeView === 'kanban' && <LayoutGrid size={48} className="mb-4 opacity-20" />}
            {activeView === 'calendar' && <Calendar size={48} className="mb-4 opacity-20" />}
            {activeView === 'analysis' && <PieChart size={48} className="mb-4 opacity-20" />}
            <p className="font-bold text-lg text-slate-500">Vista en construcción</p>
            <p className="text-sm">Esta vista estará conectada al motor de renderizado correspondiente.</p>
          </div>
        )}

      </div>
    </div>
  );
}
"""

with open('src/app/dashboard/ventas/cotizacion/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Cotizacion page created successfully")
