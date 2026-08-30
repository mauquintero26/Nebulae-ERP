import os

path = 'src/app/dashboard/compras/transito/page.tsx'

content = """"use client";

import { useState } from 'react';
import { 
  Search, Filter, LayoutGrid, List,
  MessageSquareWarning, ChevronDown, 
  Truck, Clock, MapPin, Navigation, AlertTriangle, Link as LinkIcon
} from 'lucide-react';
import Link from 'next/link';
import { ResizableHeader } from '@/components/ResizableHeader';

const FASES = [
  'Despachado por el Proveedor',
  'Proveedor -> Casillero',
  'Casillero -> Aduana',
  'Aduana -> Bodega'
];

const MOCK_TRANSITO = Array.from({ length: 24 }, (_, i) => {
  const num = i + 1;
  const diasEnFase = (num % 5) + 1; // 1 to 5 days
  const isRetrasado = diasEnFase >= 3;
  
  const faseIndex = num % 4;
  const fase = FASES[faseIndex];

  return { 
    id: `TRK-${num.toString().padStart(4, '0')}`,
    guia: `FX-${Math.floor(Math.random() * 100000000)}`,
    pec: `PEC-${(num + 10).toString().padStart(4, '0')}`,
    pven: num % 3 !== 0 ? `PVEN-${(num + 50).toString().padStart(4, '0')}` : 'Stock Interno', // Some for internal stock, some linked to sales
    proveedor: `Global Supplier ${num % 5 + 1}`, 
    fase,
    diasEnFase,
    isRetrasado,
    carrier: num % 2 === 0 ? 'DHL' : 'FedEx',
    eta: '30 Ago 2026',
  };
});

export default function MercanciaTransitoHub() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState('list');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const toggleRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedRows.length === MOCK_TRANSITO.length) setSelectedRows([]);
    else setSelectedRows(MOCK_TRANSITO.map(p => p.id));
  };

  const alertas = MOCK_TRANSITO.filter(p => p.isRetrasado);

  return (
    <div className="w-full bg-slate-50 flex flex-col px-8 py-6 min-h-max animate-in fade-in">
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            Mercancía en Tránsito
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Torre de control logístico. Rastrea las importaciones y detecta cuellos de botella.</p>
        </div>
      </div>

      {/* Alertas Críticas de Tiempos Muertos */}
      {alertas.length > 0 && (
        <div className="bg-rose-600 border border-rose-700 rounded-2xl p-4 mb-6 flex items-start gap-4 shadow-md shadow-rose-200">
          <div className="bg-white/20 text-white p-2 rounded-full shrink-0 mt-0.5">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-white font-black mb-1">¡Alerta Logística (SLA)! {alertas.length} paquetes exceden los 3 días de tolerancia</h3>
            <p className="text-rose-100 text-sm mb-3">La mercancía listada a continuación ha superado el tiempo máximo permitido en su fase actual sin avanzar.</p>
            <div className="flex flex-wrap gap-2">
              {alertas.slice(0, 8).map(a => (
                <span key={a.id} className="bg-white text-rose-700 text-xs font-bold px-3 py-1 rounded-full shadow-sm cursor-pointer hover:bg-rose-50 transition-colors">
                  {a.pec} ({a.diasEnFase} días en {a.fase})
                </span>
              ))}
              {alertas.length > 8 && <span className="text-white text-xs font-bold px-2 py-1">+{alertas.length - 8} más</span>}
            </div>
          </div>
        </div>
      )}

      {/* KPIs Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total en Tránsito</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800">{MOCK_TRANSITO.length}</h3>
            <span className="text-sm font-bold text-slate-500 mb-1">bultos/envíos</span>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">En Aduana</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-blue-600">{MOCK_TRANSITO.filter(t => t.fase.includes('Aduana')).length}</h3>
            <span className="text-sm font-bold text-slate-500 mb-1">envíos</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pedidos de Venta (PVEN) Afectados</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-purple-600">{MOCK_TRANSITO.filter(t => t.pven !== 'Stock Interno').length}</h3>
            <span className="text-sm font-bold text-slate-500 mb-1">órdenes de clientes</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tasa de Retraso (SLA)</p>
          <h3 className="text-3xl font-black text-rose-600">{Math.round((alertas.length / MOCK_TRANSITO.length) * 100)}%</h3>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white py-3 px-4 border border-slate-200 rounded-t-2xl">
        <div className="flex-1 flex items-center gap-3 w-full">
          <div className="relative flex-1 max-w-2xl flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
            <Search className="text-slate-400 shrink-0 mr-2" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por PEC, PVEN, Guía o Carrier..." 
              className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm shrink-0">
            <Filter size={16} /> Fase Logística <ChevronDown size={14}/>
          </button>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl shrink-0 border border-slate-200">
          <button onClick={() => setActiveView('list')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <List size={18} />
          </button>
          <button onClick={() => setActiveView('grid')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <LayoutGrid size={18} />
          </button>
        </div>
      </div>

      {/* Tabla Dinámica (Sin Caja Exterior para scroll infinito) */}
      <div className="bg-white flex flex-col border border-t-0 border-slate-200 rounded-b-2xl overflow-hidden shadow-sm">
        {activeView === 'list' ? (
          <div className="w-full">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                  <th className="px-6 py-4 font-bold w-12">
                    <input type="checkbox" checked={selectedRows.length === MOCK_TRANSITO.length} onChange={toggleAll} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                  </th>
                  <ResizableHeader>Tracking / Guía</ResizableHeader>
                  <ResizableHeader>P. Compra (PEC)</ResizableHeader>
                  <ResizableHeader>P. Venta Asociado (PVEN)</ResizableHeader>
                  <ResizableHeader>Fase Actual</ResizableHeader>
                  <ResizableHeader>Timer / Tolerancia (3 días)</ResizableHeader>
                  <ResizableHeader>ETA Bodega</ResizableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {MOCK_TRANSITO.map((trk) => (
                  <tr key={trk.id} className={`hover:bg-slate-50 transition-colors ${trk.isRetrasado ? 'bg-rose-50/40' : ''}`}>
                    <td className="px-6 py-4">
                      <input type="checkbox" checked={selectedRows.includes(trk.id)} onChange={() => toggleRow(trk.id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                    </td>
                    
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-800">{trk.guia}</span>
                        <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><Navigation size={10}/> {trk.carrier}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <Link href={`/dashboard/compras/pedidos/${trk.pec.toLowerCase()}`} className="flex items-center gap-1.5 font-black text-emerald-600 hover:text-emerald-800 hover:underline">
                        <LinkIcon size={14} /> {trk.pec}
                      </Link>
                    </td>
                    
                    <td className="px-6 py-4">
                      {trk.pven === 'Stock Interno' ? (
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold border border-slate-200">Stock Interno</span>
                      ) : (
                        <Link href={`/dashboard/ventas/venta/${trk.pven.toLowerCase()}`} className="flex items-center gap-1.5 font-black text-purple-600 hover:text-purple-800 hover:underline">
                          <LinkIcon size={14} /> {trk.pven}
                        </Link>
                      )}
                    </td>
                    
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Truck size={16} className={trk.fase.includes('Bodega') ? 'text-purple-500' : 'text-blue-500'} />
                        <span className="font-bold text-slate-700">{trk.fase}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div 
                            className={`h-full ${trk.isRetrasado ? 'bg-rose-500' : 'bg-blue-500'}`} 
                            style={{ width: `${Math.min((trk.diasEnFase / 3) * 100, 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-black w-14 text-right ${trk.isRetrasado ? 'text-rose-600' : 'text-slate-600'}`}>
                          {trk.diasEnFase} / 3d
                        </span>
                        {trk.isRetrasado && <AlertTriangle size={14} className="text-rose-500" />}
                      </div>
                    </td>

                    <td className="px-6 py-4 font-bold text-slate-600">
                      {trk.eta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12">
            <LayoutGrid size={48} className="mb-4 opacity-20" />
            <p className="font-bold text-lg text-slate-500">Mapa Global Logístico en construcción</p>
          </div>
        )}
      </div>
    </div>
  );
}
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Mercancia Transito Hub created")
