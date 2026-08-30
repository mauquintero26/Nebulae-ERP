"use client";

import { ArrowRightLeft, Search, Filter, Download, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';

const KARDEX_MOCK = [
  { id: 'MOV-1001', fecha: '2026-08-23 08:30', tipo: 'Entrada', sku: 'IP15P-SG', producto: 'iPhone 15 Pro - Space Gray', cantidad: 50, origen: 'Proveedor (Apple Inc)', destino: 'Bodega Central', usuario: 'Admin' },
  { id: 'MOV-1002', fecha: '2026-08-23 10:15', tipo: 'Salida', sku: 'CAM-BLA-M', producto: 'Camiseta Básica - Blanco M', cantidad: 2, origen: 'Bodega Central', destino: 'Cliente (Orden #4092)', usuario: 'Ventas Web' },
  { id: 'MOV-1003', fecha: '2026-08-23 11:45', tipo: 'Traslado', sku: 'MAC-M3-512', producto: 'MacBook Pro M3 - 512GB', cantidad: 5, origen: 'Bodega Central', destino: 'Punto de Venta 1', usuario: 'Logística' },
  { id: 'MOV-1004', fecha: '2026-08-22 16:20', tipo: 'Ajuste', sku: 'AUD-AIR-P2', producto: 'AirPods Pro 2', cantidad: -1, origen: 'Bodega Central', destino: 'Pérdida/Daño', usuario: 'Supervisor' },
  { id: 'MOV-1005', fecha: '2026-08-22 09:10', tipo: 'Entrada', sku: 'CAM-BLA-M', producto: 'Camiseta Básica - Blanco M', cantidad: 100, origen: 'Proveedor (Textiles S.A)', destino: 'Bodega Central', usuario: 'Admin' },
];

export default function KardexPage() {
  return (
    <div className="p-8 h-full overflow-y-auto space-y-6 animate-in fade-in duration-500 custom-scrollbar bg-slate-50">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-md shadow-emerald-200">
              <ArrowRightLeft size={24} />
            </div>
            Movimientos (Kardex)
          </h1>
          <p className="text-slate-500 mt-1">Historial detallado de entradas, salidas y traslados de inventario.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar por SKU, producto..." 
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-64 shadow-sm"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors">
            <Filter size={16} /> Filtros
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors">
            <Download size={16} /> Exportar
          </button>
        </div>
      </div>

      {/* Tabla Kardex */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <th className="p-4 pl-6">ID / Fecha</th>
                <th className="p-4">Tipo</th>
                <th className="p-4">SKU / Producto</th>
                <th className="p-4 text-center">Cant.</th>
                <th className="p-4">Origen ➔ Destino</th>
                <th className="p-4 pr-6">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {KARDEX_MOCK.map((mov) => (
                <tr key={mov.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 pl-6">
                    <div className="font-bold text-slate-800">{mov.id}</div>
                    <div className="text-xs text-slate-500">{mov.fecha}</div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      mov.tipo === 'Entrada' ? 'bg-green-100 text-green-700' :
                      mov.tipo === 'Salida' ? 'bg-red-100 text-red-700' :
                      mov.tipo === 'Traslado' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {mov.tipo === 'Entrada' && <ArrowDownRight size={12} className="mr-1" />}
                      {mov.tipo === 'Salida' && <ArrowUpRight size={12} className="mr-1" />}
                      {mov.tipo === 'Traslado' && <RefreshCw size={12} className="mr-1" />}
                      {mov.tipo}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-slate-700 font-mono text-xs mb-0.5">{mov.sku}</div>
                    <div className="text-slate-600 font-medium truncate max-w-[200px]">{mov.producto}</div>
                  </td>
                  <td className="p-4">
                    <div className={`text-center font-black ${
                      mov.cantidad > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {mov.cantidad > 0 ? `+${mov.cantidad}` : mov.cantidad}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-xs font-medium text-slate-500 mb-0.5"><span className="text-slate-400">De:</span> {mov.origen}</div>
                    <div className="text-xs font-medium text-slate-800"><span className="text-slate-400">A:</span> {mov.destino}</div>
                  </td>
                  <td className="p-4 pr-6">
                    <div className="inline-flex items-center px-2 py-1 bg-slate-100 rounded-md text-xs font-bold text-slate-600">
                      {mov.usuario}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination mock */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-sm text-slate-500">
          <div>Mostrando 1 a 5 de 1,245 movimientos</div>
          <div className="flex gap-1">
            <button className="px-3 py-1 bg-white border border-slate-200 rounded-md hover:bg-slate-50">Anterior</button>
            <button className="px-3 py-1 bg-white border border-slate-200 rounded-md hover:bg-slate-50">Siguiente</button>
          </div>
        </div>
      </div>
    </div>
  );
}
