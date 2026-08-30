"use client";

import { useState } from 'react';
import { 
  Search, Filter, LayoutGrid, List,
  MessageSquareWarning, ChevronDown, CheckSquare,
  PackageSearch, Archive, ShieldCheck, Link as LinkIcon
} from 'lucide-react';
import Link from 'next/link';
import { ResizableHeader } from '@/components/ResizableHeader';

const MOCK_RECEPCIONES = Array.from({ length: 18 }, (_, i) => {
  const num = i + 1;
  const isRetrasado = [3, 8].includes(num); // Faltantes o discrepancias
  
  let estado = 'Pendiente de Conteo';
  if (num % 4 === 0) estado = 'Validado (Facturable)';
  else if (num % 7 === 0) estado = 'Discrepancia';

  return { 
    id: `ENINV-${num.toString().padStart(4, '0')}`,
    pec: `PEC-${(num + 10).toString().padStart(4, '0')}`,
    pven: num % 2 === 0 ? `PVEN-${(num + 50).toString().padStart(4, '0')}` : 'Stock Interno',
    proveedor: `Global Supplier ${num % 5 + 1}`, 
    fechaLlegada: '26 Ago 2026',
    articulos: num * 5,
    estado,
    discrepancia: isRetrasado,
    responsable: `Bodeguero ${num % 2 + 1}`
  };
});

export default function RecepcionesHub() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState('list');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const toggleRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedRows.length === MOCK_RECEPCIONES.length) setSelectedRows([]);
    else setSelectedRows(MOCK_RECEPCIONES.map(p => p.id));
  };

  const alertas = MOCK_RECEPCIONES.filter(p => p.discrepancia);

  return (
    <div className="w-full bg-white flex flex-col px-8 py-6 min-h-max animate-in fade-in">
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            Recepciones de Mercancía
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Inspección, conteo ciego y validación para autorización de facturas.</p>
        </div>
      </div>

      {/* Alertas Críticas (Discrepancias) */}
      {alertas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-4 shadow-sm">
          <div className="bg-amber-100 text-amber-600 p-2 rounded-full shrink-0 mt-0.5">
            <MessageSquareWarning size={20} />
          </div>
          <div>
            <h3 className="text-amber-800 font-black mb-1">¡Atención! Tienes {alertas.length} recepciones con discrepancias de inventario</h3>
            <p className="text-amber-700 text-sm mb-3">Las cantidades recibidas no coinciden con la orden de compra. Requiere revisión para facturar.</p>
            <div className="flex flex-wrap gap-2">
              {alertas.map(a => (
                <Link key={a.id} href={`/dashboard/compras/recepciones/${a.id.toLowerCase()}`} className="bg-white border border-amber-200 text-amber-700 text-xs font-bold px-3 py-1 rounded-full shadow-sm hover:bg-amber-100 transition-colors cursor-pointer">
                  {a.id} ({a.pec})
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* KPIs Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">En Muelle (Pendientes)</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800">{MOCK_RECEPCIONES.filter(r => r.estado === 'Pendiente de Conteo').length}</h3>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">Validadas hoy</p>
          <h3 className="text-3xl font-black">{MOCK_RECEPCIONES.filter(r => r.estado === 'Validado (Facturable)').length}</h3>
          <p className="text-xs font-bold mt-2 opacity-90 text-emerald-100">Listas para cruce de facturas</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Discrepancias</p>
          <h3 className="text-3xl font-black text-amber-600">{alertas.length}</h3>
          <p className="text-xs font-bold text-slate-400 mt-2 flex items-center gap-1">Diferencia vs PEC</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Volumen Físico</p>
          <h3 className="text-3xl font-black text-slate-800">4,200</h3>
          <p className="text-xs font-bold text-slate-400 mt-2 flex items-center gap-1">Unidades procesadas</p>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white py-3 border-b border-slate-100">
        <div className="flex-1 flex items-center gap-3 w-full">
          <div className="relative flex-1 max-w-2xl flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
            <Search className="text-slate-400 shrink-0 mr-2" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por Entrada, PEC o PVEN..." 
              className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm shrink-0">
            <Filter size={16} /> Estado de Conteo <ChevronDown size={14}/>
          </button>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
          <button onClick={() => setActiveView('list')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'list' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <List size={18} />
          </button>
          <button onClick={() => setActiveView('grid')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'grid' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <LayoutGrid size={18} />
          </button>
        </div>
      </div>

      {/* Tabla Dinámica */}
      <div className="bg-white flex flex-col">
        {activeView === 'list' ? (
          <>
          {selectedRows.length > 0 && (
            <div className="bg-emerald-50 px-6 py-3 flex items-center justify-between border-b border-emerald-100 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-emerald-900">{selectedRows.length} Entradas seleccionadas</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-2 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                  <CheckSquare size={14} /> Aprobar Masivo
                </button>
              </div>
            </div>
          )}

          <div className="w-full">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider sticky top-0 z-10 bg-white shadow-sm">
                  <th className="px-6 py-4 font-bold w-12">
                    <input type="checkbox" checked={selectedRows.length === MOCK_RECEPCIONES.length} onChange={toggleAll} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                  </th>
                  <ResizableHeader>ID Recepción</ResizableHeader>
                  <ResizableHeader>P. Compra (PEC)</ResizableHeader>
                  <ResizableHeader>P. Venta (PVEN)</ResizableHeader>
                  <ResizableHeader>Proveedor</ResizableHeader>
                  <ResizableHeader>Fecha Llegada</ResizableHeader>
                  <ResizableHeader>Artículos Requeridos</ResizableHeader>
                  <ResizableHeader>Estado / Inspección</ResizableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {MOCK_RECEPCIONES.map((rec) => (
                  <tr key={rec.id} className={`hover:bg-slate-50 transition-colors ${selectedRows.includes(rec.id) ? 'bg-emerald-50/50' : ''} ${rec.discrepancia ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-6 py-4">
                      <input type="checkbox" checked={selectedRows.includes(rec.id)} onChange={() => toggleRow(rec.id)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                    </td>
                    
                    <td className="px-6 py-4 font-black text-emerald-600 hover:text-emerald-800 hover:underline">
                      <Link href={`/dashboard/compras/recepciones/${rec.id.toLowerCase()}`}>{rec.id}</Link>
                    </td>

                    <td className="px-6 py-4">
                      <Link href={`/dashboard/compras/pedidos/${rec.pec.toLowerCase()}`} className="flex items-center gap-1.5 font-bold text-slate-600 hover:text-emerald-700 hover:underline">
                        <LinkIcon size={14} /> {rec.pec}
                      </Link>
                    </td>

                    <td className="px-6 py-4">
                      {rec.pven === 'Stock Interno' ? (
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold border border-slate-200">Stock Interno</span>
                      ) : (
                        <Link href={`/dashboard/ventas/venta/${rec.pven.toLowerCase()}`} className="flex items-center gap-1.5 font-bold text-purple-600 hover:text-purple-800 hover:underline">
                          <LinkIcon size={14} /> {rec.pven}
                        </Link>
                      )}
                    </td>

                    <td className="px-6 py-4 font-bold text-slate-700">{rec.proveedor}</td>
                    
                    <td className="px-6 py-4 text-slate-500 font-medium">{rec.fechaLlegada}</td>
                    
                    <td className="px-6 py-4 font-black text-slate-800 flex items-center gap-2">
                      <Archive size={16} className="text-slate-400"/> {rec.articulos}
                    </td>

                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1.5 rounded-md text-xs font-bold border flex items-center gap-1.5 w-max ${
                        rec.estado === 'Pendiente de Conteo' ? 'bg-slate-50 text-slate-700 border-slate-200' :
                        rec.estado === 'Validado (Facturable)' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {rec.estado === 'Pendiente de Conteo' && <PackageSearch size={14} />}
                        {rec.estado === 'Validado (Facturable)' && <ShieldCheck size={14} />}
                        {rec.estado === 'Discrepancia' && <MessageSquareWarning size={14} />}
                        {rec.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
            <span className="text-sm text-slate-500">Mostrando 1 a 18 recepciones</span>
            <div className="flex items-center gap-1">
              <button className="px-3 py-1 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors">Anterior</button>
              <button className="w-8 h-8 rounded-lg bg-emerald-600 text-white text-sm font-bold shadow-sm">1</button>
              <button className="px-3 py-1 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors">Siguiente</button>
            </div>
          </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12">
            <LayoutGrid size={48} className="mb-4 opacity-20" />
            <p className="font-bold text-lg text-slate-500">Vista Kanban de Bodega en construcción</p>
          </div>
        )}
      </div>
    </div>
  );
}
