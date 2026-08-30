import os

os.makedirs('src/app/dashboard/ventas/venta', exist_ok=True)

content = """"use client";

import { useState } from 'react';
import { 
  BadgeDollarSign, Search, Filter, Plus, AlertCircle, 
  TrendingUp, Wallet, CheckCircle2, ArrowUpRight, ArrowDownRight, 
  MoreVertical, List, LayoutGrid, Calendar, PieChart, ChevronDown, X,
  Trash2, FileText, CheckSquare, Send, ShoppingBag, Truck
} from 'lucide-react';

const MOCK_VENTAS = Array.from({ length: 25 }, (_, i) => {
  const num = i + 1;
  const isPending = num % 4 === 0;
  const isEcom = num % 3 === 0;
  
  let estado = "Pagado";
  if (isPending) estado = "Pendiente de Pago";
  if (num % 7 === 0) estado = "Borrador";

  let logistica = "Entregado";
  if (estado === "Pendiente de Pago") logistica = "Retenido";
  else if (num % 5 === 0) logistica = "Por Despachar";

  return { 
    id: `VEN-${num.toString().padStart(4, '0')}`, 
    cliente: `Cliente Corporativo ${num}`, 
    origen: isEcom ? 'E-Commerce' : `COT-${(num * 12).toString().padStart(4, '0')}`,
    monto: `$${(num * 1450).toLocaleString('en-US')}.00`, 
    estado: estado, 
    logistica: logistica,
    ultimaAct: 'Hace ' + (num % 24 + 1) + ' horas', 
    responsable: `Asesor ${num % 4 + 1}`, 
    alerta: estado === 'Pendiente de Pago' && num % 2 === 0
  };
});

export default function VentasHubPage() {
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
    if (selectedRows.length === MOCK_VENTAS.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(MOCK_VENTAS.map(s => s.id));
    }
  };

  const ventasConAlerta = MOCK_VENTAS.filter(v => v.alerta);

  return (
    <div className="w-full bg-white flex flex-col px-8 py-6 animate-in fade-in">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-emerald-600">
            <BadgeDollarSign size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Hub de Ventas Central</h1>
            <p className="text-slate-500 text-sm mt-1">Acopio de todas las ventas ganadas desde E-Commerce, Cotizaciones y CRM.</p>
          </div>
        </div>
        
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
          <Plus size={18} /> Nueva Venta Manual
        </button>
      </div>

      {/* Alertas Críticas Financieras */}
      {ventasConAlerta.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-4 shadow-sm">
          <div className="bg-amber-100 text-amber-600 p-2 rounded-full shrink-0 mt-0.5">
            <Wallet size={20} />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-amber-800 text-sm">Cuentas por Cobrar Atrasadas</h3>
            <p className="text-amber-700 text-sm mt-1">
              Tienes <strong>{ventasConAlerta.length} ventas confirmadas</strong> que superan los términos de crédito sin registrar pago. Bloquea despachos hasta conciliar.
            </p>
          </div>
          <button className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm">
            Gestionar Cobros
          </button>
        </div>
      )}

      {/* KPIs HUB */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-black"><TrendingUp size={48} /></div>
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">Ingresos (Mes Actual)</p>
          <h3 className="text-3xl font-black">$124.5M</h3>
          <p className="text-xs font-bold mt-2 opacity-90 flex items-center gap-1"><ArrowUpRight size={14}/> +18% vs mes anterior</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><ShoppingBag size={48} /></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ticket Promedio</p>
          <h3 className="text-3xl font-black text-slate-800">$4,250.00</h3>
          <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1"><ArrowUpRight size={14}/> +$120 vs ayer</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Wallet size={48} /></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Facturación Pendiente</p>
          <h3 className="text-3xl font-black text-amber-600">$18.2M</h3>
          <p className="text-xs font-bold text-amber-500 mt-2 flex items-center gap-1">En {MOCK_VENTAS.filter(v => v.estado === 'Pendiente de Pago').length} ventas sin conciliar</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><CheckCircle2 size={48} /></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tasa de Conversión (General)</p>
          <h3 className="text-3xl font-black text-slate-800">42%</h3>
          <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1"><ArrowUpRight size={14}/> Cotización a Venta</p>
        </div>
      </div>

      {/* Controles de Búsqueda Avanzada y Vistas */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white py-3 border-b border-slate-100">
        
        {/* Buscador Avanzado (Izquierda) */}
        <div className="flex-1 flex items-center gap-3 w-full">
          <div className="relative flex-1 max-w-2xl flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
            <Search className="text-slate-400 mr-2 shrink-0" size={18} />
            
            {/* Filter Pills */}
            <div className="flex items-center gap-1 mr-2 shrink-0">
              <span className="flex items-center gap-1 bg-white border border-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-md shadow-sm">
                Origen: E-Commerce <button className="hover:text-red-500"><X size={12}/></button>
              </span>
            </div>
            
            <input 
              type="text" 
              placeholder="Buscar por ID (VEN-0001), Cliente, Cotización Origen..." 
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
            className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeView === 'list' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            title="Libro Mayor (Lista)"
          >
            <List size={18} />
          </button>
          <button 
            onClick={() => setActiveView('kanban')}
            className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeView === 'kanban' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            title="Kanban de Facturación"
          >
            <LayoutGrid size={18} />
          </button>
          <button 
            onClick={() => setActiveView('calendar')}
            className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeView === 'calendar' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            title="Calendario de Cobros y Despachos"
          >
            <Calendar size={18} />
          </button>
          <button 
            onClick={() => setActiveView('analysis')}
            className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeView === 'analysis' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            title="Análisis Financiero"
          >
            <PieChart size={18} />
          </button>
        </div>
      </div>

      {/* Área Principal de Contenido (Depende de activeView) */}
      <div className="bg-white flex flex-col">
        
        {/* Barra de Acciones Múltiples (Aparece si hay checkboxes seleccionados) */}
        {selectedRows.length > 0 && activeView === 'list' && (
          <div className="bg-emerald-50 px-6 py-3 flex items-center justify-between border-b border-emerald-100 animate-in fade-in slide-in-from-top-2 sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <span className="bg-emerald-600 text-white text-xs font-bold px-2 py-1 rounded-md">{selectedRows.length}</span>
              <span className="text-sm font-bold text-emerald-900">Ventas seleccionadas</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                <FileText size={14} /> Facturar en Bloque
              </button>
              <button className="flex items-center gap-2 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                <Truck size={14} /> Crear Rutas Logísticas
              </button>
              <button className="flex items-center gap-2 bg-white border border-amber-200 text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-2">
                <Send size={14} /> Reclamar Pago
              </button>
            </div>
          </div>
        )}

        {activeView === 'list' && (
          <div className="w-full">
            <table className="w-full text-left border-b border-slate-100">
              <thead>
                <tr className="bg-white border-b border-slate-200 text-xs text-slate-400 uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                  <th className="px-6 py-4 font-bold w-12">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                      checked={selectedRows.length === MOCK_VENTAS.length && MOCK_VENTAS.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-6 py-4 font-bold">Venta</th>
                  <th className="px-6 py-4 font-bold">Cliente</th>
                  <th className="px-6 py-4 font-bold">Origen (Hub)</th>
                  <th className="px-6 py-4 font-bold">Monto</th>
                  <th className="px-6 py-4 font-bold">Financiero</th>
                  <th className="px-6 py-4 font-bold">Logístico</th>
                  <th className="px-6 py-4 font-bold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {MOCK_VENTAS.map(venta => {
                  const isSelected = selectedRows.includes(venta.id);
                  return (
                    <tr key={venta.id} className={`transition-colors ${isSelected ? 'bg-emerald-50/50' : venta.alerta ? 'bg-amber-50/30 hover:bg-amber-50/50' : 'hover:bg-slate-50'}`}>
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                          checked={isSelected}
                          onChange={() => toggleRow(venta.id)}
                        />
                      </td>
                      <td className="px-6 py-4 font-black text-slate-800">{venta.id}</td>
                      <td className="px-6 py-4 font-bold text-slate-700">{venta.cliente}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold border ${
                          venta.origen === 'E-Commerce' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {venta.origen}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-black text-slate-800">{venta.monto}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                          venta.estado === 'Borrador' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                          venta.estado === 'Pendiente de Pago' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {venta.estado}
                        </span>
                        {venta.alerta && <AlertCircle size={14} className="text-amber-500 inline ml-2" title="Cobro atrasado" />}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                          venta.logistica === 'Retenido' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          venta.logistica === 'Por Despachar' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {venta.logistica}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-slate-400 hover:text-emerald-600 transition-colors">
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
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
            <span className="text-sm text-slate-500">Mostrando 1 a 25 de 430 ventas registradas</span>
            <div className="flex items-center gap-1">
              <button className="px-3 py-1 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors">Anterior</button>
              <button className="w-8 h-8 rounded-lg bg-emerald-600 text-white text-sm font-bold shadow-sm">1</button>
              <button className="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">2</button>
              <button className="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">3</button>
              <span className="text-slate-400 px-2">...</span>
              <button className="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">18</button>
              <button className="px-3 py-1 text-sm font-medium text-emerald-600 hover:text-emerald-800 transition-colors">Siguiente</button>
            </div>
          </div>
        )}

        {/* Placeholder para otras vistas */}
        {activeView !== 'list' && (
          <div className="w-full py-32 flex flex-col items-center justify-center text-slate-400">
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

with open('src/app/dashboard/ventas/venta/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Venta Hub page created successfully")
