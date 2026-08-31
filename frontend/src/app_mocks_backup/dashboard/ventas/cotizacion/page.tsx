"use client";

import { useState } from 'react';
import { 
  BadgeDollarSign, Search, Filter, Plus, AlertCircle, 
  TrendingUp, Wallet, CheckCircle2, ArrowUpRight, ArrowDownRight, 
  MoreVertical, List, LayoutGrid, Calendar, PieChart, ChevronDown, X,
  Trash2, FileText, CheckSquare, Send, MessageSquareWarning
} from 'lucide-react';
import Link from 'next/link';
import { ResizableHeader } from '@/components/ResizableHeader';

const MOCK_COTIZACIONES = [
  { id: 'COT-0001', origen_sc: 'SC-0003', cliente: 'Empresa Cliente 1', monto: '$1,200.00', fecha: '23 Ago 2026', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 2 horas', responsable: 'Agente 2', desatendida: false },
  { id: 'COT-0002', origen_sc: 'SC-0006', cliente: 'Empresa Cliente 2', monto: '$2,400.00', fecha: '23 Ago 2026', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 3 días', responsable: 'Agente 3', desatendida: true },
  { id: 'COT-0003', origen_sc: 'SC-0009', cliente: 'Empresa Cliente 3', monto: '$3,600.00', fecha: '23 Ago 2026', estado: 'Pendiente por Cotizar', ultimaAct: 'Hace 3 días', responsable: 'Agente 1', desatendida: true },
  { id: 'COT-0004', origen_sc: 'SC-0012', cliente: 'Empresa Cliente 4', monto: '$4,800.00', fecha: '23 Ago 2026', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 2 horas', responsable: 'Agente 2', desatendida: false },
  { id: 'COT-0005', origen_sc: 'SC-0015', cliente: 'Empresa Cliente 5', monto: '$6,000.00', fecha: '23 Ago 2026', estado: 'Cotización Confirmada', ultimaAct: 'Hace 2 horas', responsable: 'Agente 3', desatendida: false },
  { id: 'COT-0006', origen_sc: 'SC-0018', cliente: 'Empresa Cliente 6', monto: '$7,200.00', fecha: '23 Ago 2026', estado: 'Pendiente por Cotizar', ultimaAct: 'Hace 2 horas', responsable: 'Agente 1', desatendida: false },
  { id: 'COT-0007', origen_sc: 'SC-0021', cliente: 'Empresa Cliente 7', monto: '$8,400.00', fecha: '23 Ago 2026', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 2 horas', responsable: 'Agente 2', desatendida: false },
  { id: 'COT-0008', origen_sc: 'SC-0024', cliente: 'Empresa Cliente 8', monto: '$9,600.00', fecha: '23 Ago 2026', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 2 horas', responsable: 'Agente 3', desatendida: false },
  { id: 'COT-0009', origen_sc: 'SC-0027', cliente: 'Empresa Cliente 9', monto: '$10,800.00', fecha: '23 Ago 2026', estado: 'Pendiente por Cotizar', ultimaAct: 'Hace 2 horas', responsable: 'Agente 1', desatendida: false },
  { id: 'COT-0010', origen_sc: 'SC-0030', cliente: 'Empresa Cliente 10', monto: '$12,000.00', fecha: '23 Ago 2026', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 2 horas', responsable: 'Agente 2', desatendida: false },
  { id: 'COT-0011', origen_sc: 'SC-0033', cliente: 'Empresa Cliente 11', monto: '$13,200.00', fecha: '23 Ago 2026', estado: 'Cotización Confirmada', ultimaAct: 'Hace 2 horas', responsable: 'Agente 3', desatendida: false },
  { id: 'COT-0012', origen_sc: 'SC-0036', cliente: 'Empresa Cliente 12', monto: '$14,400.00', fecha: '23 Ago 2026', estado: 'Pendiente por Cotizar', ultimaAct: 'Hace 2 horas', responsable: 'Agente 1', desatendida: false },
  { id: 'COT-0013', origen_sc: 'SC-0039', cliente: 'Empresa Cliente 13', monto: '$15,600.00', fecha: '23 Ago 2026', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 2 horas', responsable: 'Agente 2', desatendida: false },
  { id: 'COT-0014', origen_sc: 'SC-0042', cliente: 'Empresa Cliente 14', monto: '$16,800.00', fecha: '23 Ago 2026', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 3 días', responsable: 'Agente 3', desatendida: true },
  { id: 'COT-0015', origen_sc: 'SC-0045', cliente: 'Empresa Cliente 15', monto: '$18,000.00', fecha: '23 Ago 2026', estado: 'Pendiente por Cotizar', ultimaAct: 'Hace 2 horas', responsable: 'Agente 1', desatendida: false },
  { id: 'COT-0016', origen_sc: 'SC-0048', cliente: 'Empresa Cliente 16', monto: '$19,200.00', fecha: '23 Ago 2026', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 2 horas', responsable: 'Agente 2', desatendida: false },
  { id: 'COT-0017', origen_sc: 'SC-0051', cliente: 'Empresa Cliente 17', monto: '$20,400.00', fecha: '23 Ago 2026', estado: 'Cotización Confirmada', ultimaAct: 'Hace 2 horas', responsable: 'Agente 3', desatendida: false },
  { id: 'COT-0018', origen_sc: 'SC-0054', cliente: 'Empresa Cliente 18', monto: '$21,600.00', fecha: '23 Ago 2026', estado: 'Pendiente por Cotizar', ultimaAct: 'Hace 2 horas', responsable: 'Agente 1', desatendida: false },
  { id: 'COT-0019', origen_sc: 'SC-0057', cliente: 'Empresa Cliente 19', monto: '$22,800.00', fecha: '23 Ago 2026', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 2 horas', responsable: 'Agente 2', desatendida: false },
  { id: 'COT-0020', origen_sc: 'SC-0060', cliente: 'Empresa Cliente 20', monto: '$24,000.00', fecha: '23 Ago 2026', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 2 horas', responsable: 'Agente 3', desatendida: false },
  { id: 'COT-0021', origen_sc: 'SC-0063', cliente: 'Empresa Cliente 21', monto: '$25,200.00', fecha: '23 Ago 2026', estado: 'Pendiente por Cotizar', ultimaAct: 'Hace 3 días', responsable: 'Agente 1', desatendida: true },
  { id: 'COT-0022', origen_sc: 'SC-0066', cliente: 'Empresa Cliente 22', monto: '$26,400.00', fecha: '23 Ago 2026', estado: 'Cotizado - Pendiente Conf.', ultimaAct: 'Hace 2 horas', responsable: 'Agente 2', desatendida: false },
  { id: 'COT-0023', origen_sc: 'SC-0069', cliente: 'Empresa Cliente 23', monto: '$27,600.00', fecha: '23 Ago 2026', estado: 'Cotización Confirmada', ultimaAct: 'Hace 2 horas', responsable: 'Agente 3', desatendida: false },
  { id: 'COT-0024', origen_sc: 'SC-0072', cliente: 'Empresa Cliente 24', monto: '$28,800.00', fecha: '23 Ago 2026', estado: 'Pendiente por Cotizar', ultimaAct: 'Hace 2 horas', responsable: 'Agente 1', desatendida: false },
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
      setSelectedRows(MOCK_COTIZACIONES.map(c => c.id));
    }
  };

  const alertas = MOCK_COTIZACIONES.filter(c => c.desatendida);

  return (
    <div className="w-full bg-white flex flex-col px-8 py-6 min-h-max animate-in fade-in">
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            Cotizaciones
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Gestiona y haz seguimiento a las propuestas comerciales.</p>
        </div>
        <Link href="/dashboard/ventas/cotizacion/nueva" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
          <Plus size={18} /> Nueva Cotización
        </Link>
      </div>

      {/* Alertas Críticas */}
      {alertas.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-6 flex items-start gap-4 shadow-sm">
          <div className="bg-rose-100 text-rose-600 p-2 rounded-full shrink-0 mt-0.5">
            <MessageSquareWarning size={20} />
          </div>
          <div>
            <h3 className="text-rose-800 font-black mb-1">¡Alerta de SLA! Tienes {alertas.length} cotizaciones desatendidas</h3>
            <p className="text-rose-600 text-sm mb-3">Las siguientes cotizaciones llevan más de 2 días sin cambio de estado.</p>
            <div className="flex flex-wrap gap-2">
              {alertas.map(a => (
                <span key={a.id} className="bg-white border border-rose-200 text-rose-700 text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                  {a.id} ({a.responsable})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* KPIs Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Activas</p>
          <h3 className="text-3xl font-black text-slate-800">124</h3>
        </div>
        
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">Pendientes por Cotizar</p>
          <h3 className="text-3xl font-black">15</h3>
          <p className="text-xs font-bold mt-2 opacity-90 text-amber-100">Requieren elaboración</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Esperando Confirmación</p>
          <h3 className="text-3xl font-black text-slate-800">42</h3>
          <p className="text-xs font-bold text-slate-400 mt-2 flex items-center gap-1">Cotizaciones enviadas</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tasa de Cierre</p>
          <h3 className="text-3xl font-black text-slate-800">38%</h3>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white py-3 border-b border-slate-100">
        <div className="flex-1 flex items-center gap-3 w-full">
          <div className="relative flex-1 max-w-2xl flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
            <div className="flex items-center gap-1 mr-2 shrink-0">
              <span className="flex items-center gap-1 bg-white border border-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-md shadow-sm">
                Cliente <ChevronDown size={12} />
              </span>
            </div>
            <Search className="text-slate-400 shrink-0 mr-2" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por ID, nombre o monto..." 
              className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm shrink-0">
            <Filter size={16} /> Filtros
          </button>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
          <button onClick={() => setActiveView('list')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <List size={18} />
          </button>
          <button onClick={() => setActiveView('grid')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <LayoutGrid size={18} />
          </button>
        </div>
      </div>

      {/* Tabla Dinámica (Sin Caja Exterior) */}
      <div className="bg-white flex flex-col">
        {activeView === 'list' ? (
          <>
          {selectedRows.length > 0 && (
            <div className="bg-blue-50 px-6 py-3 flex items-center justify-between border-b border-blue-100 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-blue-900">{selectedRows.length} Cotizaciones seleccionadas</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-2 bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                  <CheckSquare size={14} /> Aprobar
                </button>
                <button className="flex items-center gap-2 bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                  <Send size={14} /> Re-enviar
                </button>
                <button className="flex items-center gap-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-2">
                  <Trash2 size={14} /> Eliminar
                </button>
              </div>
            </div>
          )}

          <div className="w-full">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider sticky top-0 z-10 bg-white shadow-sm">
                  <th className="px-6 py-4 font-bold w-12">
                    <input type="checkbox" checked={selectedRows.length === MOCK_COTIZACIONES.length} onChange={toggleAll} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                  </th>
                  <ResizableHeader>ID Cotización</ResizableHeader>
                  <ResizableHeader>Fecha</ResizableHeader>
                  <ResizableHeader>Cliente</ResizableHeader>
                  <ResizableHeader>Origen</ResizableHeader>
                  <ResizableHeader>Monto</ResizableHeader>
                  <ResizableHeader>Estado</ResizableHeader>
                  <ResizableHeader>Última Act.</ResizableHeader>
                  <ResizableHeader>Responsable</ResizableHeader>
                  <ResizableHeader>Acciones</ResizableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {MOCK_COTIZACIONES.map((cot) => (
                  <tr key={cot.id} className={`hover:bg-slate-50 transition-colors ${selectedRows.includes(cot.id) ? 'bg-blue-50/50' : ''} ${cot.desatendida ? 'bg-rose-50/30' : ''}`}>
                    <td className="px-6 py-4">
                      <input type="checkbox" checked={selectedRows.includes(cot.id)} onChange={() => toggleRow(cot.id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                    </td>
                    <td className="px-6 py-4 font-black text-blue-600 hover:text-blue-800 hover:underline"><Link href={`/dashboard/ventas/cotizacion/${cot.id.toLowerCase()}`}>{cot.id}</Link></td>
                    <td className="px-6 py-4 text-slate-500 text-xs font-medium">{cot.fecha}</td>
                    <td className="px-6 py-4 font-bold text-slate-700">{cot.cliente}</td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-bold border border-slate-200">
                        {cot.origen_sc}
                      </span>
                    </td>
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
                        <span className={`text-xs font-bold ${cot.desatendida ? 'text-rose-600' : 'text-slate-500'}`}>{cot.ultimaAct}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 border border-slate-300">
                          {cot.responsable.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="font-medium text-slate-700">{cot.responsable}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-slate-400 hover:text-blue-600 transition-colors">
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
            <span className="text-sm text-slate-500">Mostrando 1 a 24 de 124 cotizaciones</span>
            <div className="flex items-center gap-1">
              <button className="px-3 py-1 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors">Anterior</button>
              <button className="w-8 h-8 rounded-lg bg-blue-600 text-white text-sm font-bold shadow-sm">1</button>
              <button className="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">2</button>
              <button className="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">3</button>
              <span className="text-slate-400 px-2">...</span>
              <button className="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">5</button>
              <button className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">Siguiente</button>
            </div>
          </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12">
            <LayoutGrid size={48} className="mb-4 opacity-20" />
            <p className="font-bold text-lg text-slate-500">Vista Kanban en construcción</p>
          </div>
        )}
      </div>
    </div>
  );
}
