"use client";

import { useState } from 'react';
import { 
  Search, Filter, LayoutGrid, List, ChevronDown,
  RefreshCw
} from 'lucide-react';
import { ResizableHeader } from '@/components/ResizableHeader';

export default function TrasladosHub() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState('list');

  return (
    <div className="w-full bg-slate-50 flex flex-col px-8 py-6 min-h-max animate-in fade-in">
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <RefreshCw className="text-emerald-600" size={28} /> Traslados Internos
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Movimientos de mercancía entre bodegas, sucursales y ubicaciones.</p>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white py-3 px-4 border border-slate-200 rounded-t-2xl">
        <div className="flex-1 flex items-center gap-3 w-full">
          <div className="relative flex-1 max-w-2xl flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
            <Search className="text-slate-400 shrink-0 mr-2" size={18} />
            <input 
              type="text" 
              placeholder="Buscar..." 
              className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm shrink-0">
            <Filter size={16} /> Filtros <ChevronDown size={14}/>
          </button>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl shrink-0 border border-slate-200">
          <button onClick={() => setActiveView('list')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'list' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <List size={18} />
          </button>
          <button onClick={() => setActiveView('grid')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'grid' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <LayoutGrid size={18} />
          </button>
        </div>
      </div>

      {/* Tabla Dinámica */}
      <div className="bg-white flex flex-col border border-t-0 border-slate-200 rounded-b-2xl overflow-hidden shadow-sm">
        {activeView === 'list' ? (
          <div className="w-full">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                  <ResizableHeader>ID Traslado</ResizableHeader>
                  <ResizableHeader>Origen</ResizableHeader>
                  <ResizableHeader>Destino</ResizableHeader>
                  <ResizableHeader>Fecha</ResizableHeader>
                  <ResizableHeader>Estado</ResizableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                <tr className="hover:bg-slate-50">
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400 font-bold">
                    No hay datos registrados aún.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12">
            <LayoutGrid size={48} className="mb-4 opacity-20" />
            <p className="font-bold text-lg text-slate-500">Vista de cuadrícula en construcción</p>
          </div>
        )}
      </div>
    </div>
  );
}
