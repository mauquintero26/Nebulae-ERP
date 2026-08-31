"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ResizableHeader } from '@/components/ResizableHeader';

import { 
  FileText, Search, Filter, Plus, AlertCircle, 
  Clock, CheckCircle2, MessageSquareWarning, 
  ArrowUpRight, ArrowDownRight, MoreVertical,
  List, LayoutGrid, Calendar, PieChart, ChevronDown, X,
  Trash2, Edit, CheckSquare
} from 'lucide-react';



import { getSalesOrders, updateSalesOrderStatus } from '@/lib/api';
import toast from 'react-hot-toast';

export default function SolicitudesClientePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState('list');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [salesData, setSalesData] = useState<any[]>([]);

  useEffect(() => {
    fetchSolicitudes();
  }, []);

  const fetchSolicitudes = async () => {
    try {
      const data = await getSalesOrders();
      const realSales = data.sales || data;
      if (Array.isArray(realSales)) {
        // Filtrar solo las que sean solicitudes (estado inicial)
        const solicitudes = realSales.filter(s => s.status === 'DRAFT' || s.status === 'SOLICITUD' || s.status === 'TO_INVOICE').map(s => ({
          id: `SC-0${s.id}`,
          realId: s.id,
          date: new Date(s.created_at || Date.now()).toLocaleDateString(),
          client: `Cliente #${s.customer_id}`,
          type: s.sale_type || 'B2B',
          status: s.status === 'TO_INVOICE' ? 'Evaluación' : 'Pendiente',
          lastUpdate: '2 min',
          assigned: 'Tú',
          desatendida: false
        }));
        setSalesData(solicitudes);
      }
    } catch(e) {
      console.error(e);
    }
  };

  const MOCK_SOLICITUDES = salesData;


  const toggleRow = (id: string) => {
    if (selectedRows.includes(id)) {
      setSelectedRows(selectedRows.filter(rowId => rowId !== id));
    } else {
      setSelectedRows([...selectedRows, id]);
    }
  };

  const toggleAll = () => {
    if (selectedRows.length === MOCK_SOLICITUDES.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(MOCK_SOLICITUDES.map(s => s.id));
    }
  };

  return (
    <div className="w-full bg-white flex flex-col px-8 py-6 min-h-max">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-purple-600">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Solicitudes de Cliente</h1>
            <p className="text-slate-500 text-sm mt-1">Bandeja centralizada para cualquier tipo de requerimiento del cliente.</p>
          </div>
        </div>
        
        <Link href="/dashboard/ventas/solicitud/nueva" className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
          <Plus size={18} /> Nueva Solicitud
        </Link>
      </div>

      {/* Alertas Críticas (Desatendidas) */}
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-6 flex items-start gap-4 shadow-sm">
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
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">Desatendidas (&gt; 2 días)</p>
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

      {/* Controles de Búsqueda Avanzada y Vistas (Movidos aquí) */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white py-3 border-b border-slate-100">
        
        {/* Buscador Avanzado (Izquierda) */}
        <div className="flex-1 flex items-center gap-3 w-full">
          <div className="relative flex-1 max-w-2xl flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500 transition-all">
            <Search className="text-slate-400 mr-2 shrink-0" size={18} />
            
            {/* Filter Pills */}
            <div className="flex items-center gap-1 mr-2 shrink-0">
              <span className="flex items-center gap-1 bg-white border border-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-md shadow-sm">
                Tipo: Cotización <button className="hover:text-red-500"><X size={12}/></button>
              </span>
            </div>
            
            <input 
              type="text" 
              placeholder="Buscar por ID (Ej. SC-0001), Cliente, Asunto..." 
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
            title="Kanban Logístico / Estados"
          >
            <LayoutGrid size={18} />
          </button>
          <button 
            onClick={() => setActiveView('calendar')}
            className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeView === 'calendar' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            title="Calendario de Solicitudes"
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
      <div className="bg-white flex flex-col">
        
        {/* Barra de Acciones Múltiples (Aparece si hay checkboxes seleccionados) */}
        {selectedRows.length > 0 && activeView === 'list' && (
          <div className="bg-purple-50 px-6 py-3 flex items-center justify-between border-b border-purple-100 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <span className="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-md">{selectedRows.length}</span>
              <span className="text-sm font-bold text-purple-900">Solicitudes seleccionadas</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 bg-white border border-purple-200 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                <CheckSquare size={14} /> Marcar Resueltas
              </button>
              <button className="flex items-center gap-2 bg-white border border-purple-200 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                <Edit size={14} /> Reasignar
              </button>
              <button className="flex items-center gap-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-2">
                <Trash2 size={14} /> Eliminar
              </button>
            </div>
          </div>
        )}

        {activeView === 'list' && (
          <div className="w-full">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider sticky top-0 z-10 bg-white shadow-sm">
                  <th className="px-6 py-4 font-bold w-12">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer w-4 h-4"
                      checked={selectedRows.length === MOCK_SOLICITUDES.length && MOCK_SOLICITUDES.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  <ResizableHeader>ID Solicitud</ResizableHeader>
                  <ResizableHeader>Fecha</ResizableHeader>
                  <ResizableHeader>Cliente</ResizableHeader>
                  <ResizableHeader>Tipo</ResizableHeader>
                  <ResizableHeader>Estado</ResizableHeader>
                  <ResizableHeader>Última Act.</ResizableHeader>
                  <ResizableHeader>Responsable</ResizableHeader>
                  <ResizableHeader>Acciones</ResizableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {MOCK_SOLICITUDES.map(sol => {
                  const isSelected = selectedRows.includes(sol.id);
                  return (
                    <tr key={sol.id} className={`transition-colors ${isSelected ? 'bg-purple-50/50' : sol.desatendida ? 'bg-rose-50/30 hover:bg-rose-50/50' : 'hover:bg-slate-50'}`}>
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer w-4 h-4"
                          checked={isSelected}
                          onChange={() => toggleRow(sol.id)}
                        />
                      </td>
                      <td className="px-6 py-4 font-black text-purple-600 hover:text-purple-800 hover:underline"><Link href={`/dashboard/ventas/solicitud/${sol.id.toLowerCase()}`}>{sol.id}</Link></td>
                      <td className="px-6 py-4 text-slate-500 text-xs font-medium">{sol.fecha}</td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        
        {/* Paginación */}
        {activeView === 'list' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
            <span className="text-sm text-slate-500">Mostrando 1 a 24 de 48 solicitudes</span>
            <div className="flex items-center gap-1">
              <button className="px-3 py-1 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors">Anterior</button>
              <button className="w-8 h-8 rounded-lg bg-purple-600 text-white text-sm font-bold shadow-sm">1</button>
              <button className="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">2</button>
              <span className="text-slate-400 px-2">...</span>
              <button className="px-3 py-1 text-sm font-medium text-purple-600 hover:text-purple-800 transition-colors">Siguiente</button>
            </div>
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
