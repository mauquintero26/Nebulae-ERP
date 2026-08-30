"use client";

import { useState } from 'react';
import { 
  Search, Filter, Plus, LayoutGrid, List,
  MessageSquareWarning, ChevronDown, CheckSquare, Send, Trash2, MoreVertical,
  ShoppingCart, Truck, Clock, PackageCheck
} from 'lucide-react';
import Link from 'next/link';
import { ResizableHeader } from '@/components/ResizableHeader';

const MOCK_PEDIDOS = Array.from({ length: 24 }, (_, i) => {
  const num = i + 1;
  const isRetrasado = [2, 7, 14].includes(num);
  
  let estado = 'Pendiente por entrega';
  let tracking = 'Casillero -> Aduana';
  
  if (num % 5 === 0) {
    estado = 'Entregado en Bodega';
    tracking = 'Completado';
  } else if (num % 3 === 0) {
    estado = 'Pedido Compra Creado';
    tracking = 'Proveedor -> Casillero';
  }

  return { 
    id: `PEC-${num.toString().padStart(4, '0')}`, 
    proveedor: `Global Supplier ${num % 5 + 1}`, 
    monto: `$${(num * 2450).toLocaleString('en-US')}.00`,
    fechaCompra: '24 Ago 2026',
    fechaEntrega: isRetrasado ? '20 Ago 2026' : '30 Ago 2026',
    estado,
    tracking,
    carrier: num % 2 === 0 ? 'DHL' : 'FedEx',
    retrasado: isRetrasado,
    responsable: `Comprador ${num % 3 + 1}`,
    pven: num % 3 !== 0 ? `PVEN-${(num + 50).toString().padStart(4, '0')}` : 'Stock Interno'
  };
});

export default function PedidosCompraHub() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState('list');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const toggleRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedRows.length === MOCK_PEDIDOS.length) setSelectedRows([]);
    else setSelectedRows(MOCK_PEDIDOS.map(p => p.id));
  };

  const alertas = MOCK_PEDIDOS.filter(p => p.retrasado);

  return (
    <div className="w-full bg-white flex flex-col px-8 py-6 min-h-max animate-in fade-in">
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            Pedidos de Compra
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Gestiona y rastrea todas las órdenes emitidas a proveedores.</p>
        </div>
        <Link href="/dashboard/compras/pedidos/nueva" className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
          <Plus size={18} /> Nuevo Pedido
        </Link>
      </div>

      {/* Alertas Críticas (Retrasos) */}
      {alertas.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-6 flex items-start gap-4 shadow-sm">
          <div className="bg-rose-100 text-rose-600 p-2 rounded-full shrink-0 mt-0.5">
            <MessageSquareWarning size={20} />
          </div>
          <div>
            <h3 className="text-rose-800 font-black mb-1">¡Alerta Logística! Tienes {alertas.length} pedidos con retraso de entrega</h3>
            <p className="text-rose-600 text-sm mb-3">La fecha estimada de entrega ha caducado. Revisa los estatus de tracking.</p>
            <div className="flex flex-wrap gap-2">
              {alertas.map(a => (
                <Link key={a.id} href={`/dashboard/compras/pedidos/${a.id.toLowerCase()}`} className="bg-white border border-rose-200 text-rose-700 text-xs font-bold px-3 py-1 rounded-full shadow-sm hover:bg-rose-100 transition-colors cursor-pointer">
                  {a.id} ({a.proveedor})
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* KPIs Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Activos</p>
          <h3 className="text-3xl font-black text-slate-800">45</h3>
        </div>
        
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">En Tránsito (Tracking)</p>
          <h3 className="text-3xl font-black">28</h3>
          <p className="text-xs font-bold mt-2 opacity-90 text-blue-100">En ruta a bodega</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Retrasados</p>
          <h3 className="text-3xl font-black text-rose-600">{alertas.length}</h3>
          <p className="text-xs font-bold text-slate-400 mt-2 flex items-center gap-1">Fuera de ETA</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Volumen de Compra (Mes)</p>
          <h3 className="text-3xl font-black text-slate-800">$142k</h3>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white py-3 border-b border-slate-100">
        <div className="flex-1 flex items-center gap-3 w-full">
          <div className="relative flex-1 max-w-2xl flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
            <div className="flex items-center gap-1 mr-2 shrink-0">
              <span className="flex items-center gap-1 bg-white border border-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-md shadow-sm">
                Proveedor <ChevronDown size={12} />
              </span>
            </div>
            <Search className="text-slate-400 shrink-0 mr-2" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por ID, proveedor o tracking..." 
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
          <button onClick={() => setActiveView('list')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'list' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <List size={18} />
          </button>
          <button onClick={() => setActiveView('grid')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'grid' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <LayoutGrid size={18} />
          </button>
        </div>
      </div>

      {/* Tabla Dinámica (Sin Caja Exterior) */}
      <div className="bg-white flex flex-col">
        {activeView === 'list' ? (
          <>
          {selectedRows.length > 0 && (
            <div className="bg-emerald-50 px-6 py-3 flex items-center justify-between border-b border-emerald-100 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-emerald-900">{selectedRows.length} Pedidos seleccionados</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-2 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                  <CheckSquare size={14} /> Aprobar
                </button>
                <button className="flex items-center gap-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-2">
                  <Trash2 size={14} /> Cancelar Pedidos
                </button>
              </div>
            </div>
          )}

          <div className="w-full">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider sticky top-0 z-10 bg-white shadow-sm">
                  <th className="px-6 py-4 font-bold w-12">
                    <input type="checkbox" checked={selectedRows.length === MOCK_PEDIDOS.length} onChange={toggleAll} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                  </th>
                  <ResizableHeader>ID Pedido</ResizableHeader>
                  <ResizableHeader>P. Venta (PVEN)</ResizableHeader>
                  <ResizableHeader>Fecha Compra</ResizableHeader>
                  <ResizableHeader>Proveedor</ResizableHeader>
                  <ResizableHeader>Monto</ResizableHeader>
                  <ResizableHeader>Estado del Pedido</ResizableHeader>
                  <ResizableHeader>Fase de Tracking</ResizableHeader>
                  <ResizableHeader>ETA (Entrega Estimada)</ResizableHeader>
                  <ResizableHeader>Acciones</ResizableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {MOCK_PEDIDOS.map((pedido) => (
                  <tr key={pedido.id} className={`hover:bg-slate-50 transition-colors ${selectedRows.includes(pedido.id) ? 'bg-emerald-50/50' : ''} ${pedido.retrasado ? 'bg-rose-50/30' : ''}`}>
                    <td className="px-6 py-4">
                      <input type="checkbox" checked={selectedRows.includes(pedido.id)} onChange={() => toggleRow(pedido.id)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                    </td>
                    <td className="px-6 py-4 font-black text-emerald-600 hover:text-emerald-800 hover:underline"><Link href={`/dashboard/compras/pedidos/${pedido.id.toLowerCase()}`}>{pedido.id}</Link></td>

                    <td className="px-6 py-4">
                      {pedido.pven === 'Stock Interno' ? (
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold border border-slate-200">Stock Interno</span>
                      ) : (
                        <Link href={`/dashboard/ventas/venta/${pedido.pven.toLowerCase()}`} className="flex items-center gap-1 font-black text-purple-600 hover:text-purple-800 hover:underline">
                          {pedido.pven}
                        </Link>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs font-medium">{pedido.fechaCompra}</td>
                    <td className="px-6 py-4 font-bold text-slate-700">{pedido.proveedor}</td>
                    <td className="px-6 py-4 font-black text-slate-800">{pedido.monto}</td>
                    
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                        pedido.estado === 'Pedido Compra Creado' ? 'bg-slate-50 text-slate-700 border-slate-200' :
                        pedido.estado === 'Pendiente por entrega' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {pedido.estado}
                      </span>
                    </td>
                    
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md border border-slate-200 w-max">
                        <Truck size={14} className={pedido.estado === 'Entregado en Bodega' ? 'text-emerald-500' : 'text-blue-500'} />
                        {pedido.tracking}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className={pedido.retrasado ? 'text-rose-500' : 'text-slate-400'} />
                        <span className={`text-xs font-bold ${pedido.retrasado ? 'text-rose-600' : 'text-slate-600'}`}>{pedido.fechaEntrega}</span>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 text-right">
                      <button className="text-slate-400 hover:text-emerald-600 transition-colors">
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
            <span className="text-sm text-slate-500">Mostrando 1 a 24 de 45 pedidos</span>
            <div className="flex items-center gap-1">
              <button className="px-3 py-1 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors">Anterior</button>
              <button className="w-8 h-8 rounded-lg bg-emerald-600 text-white text-sm font-bold shadow-sm">1</button>
              <button className="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">2</button>
              <button className="px-3 py-1 text-sm font-medium text-emerald-600 hover:text-emerald-800 transition-colors">Siguiente</button>
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
