"use client";

import { Layers, Search, Filter, Download, AlertCircle, CheckCircle2 } from 'lucide-react';

const STOCK_MOCK = [
  { sku: 'IP15P-SG', producto: 'iPhone 15 Pro - Space Gray', categoria: 'Electrónica', central: 145, sucursal1: 20, total: 165, minimo: 50, estado: 'ok' },
  { sku: 'MAC-M3-512', producto: 'MacBook Pro M3 - 512GB', categoria: 'Computación', central: 2, sucursal1: 0, total: 2, minimo: 10, estado: 'alert' },
  { sku: 'CAM-BLA-M', producto: 'Camiseta Básica - Blanco M', categoria: 'Ropa', central: 0, sucursal1: 5, total: 5, minimo: 50, estado: 'critical' },
  { sku: 'AUD-AIR-P2', producto: 'AirPods Pro 2', categoria: 'Accesorios', central: 430, sucursal1: 85, total: 515, minimo: 100, estado: 'ok' },
  { sku: 'MON-LG-32', producto: 'Monitor LG UltraGear 32"', categoria: 'Computación', central: 15, sucursal1: 3, total: 18, minimo: 20, estado: 'alert' },
];

export default function StockPage() {
  return (
    <div className="p-8 h-full overflow-y-auto space-y-6 animate-in fade-in duration-500 custom-scrollbar bg-slate-50">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-md shadow-indigo-200">
              <Layers size={24} />
            </div>
            Stock Actual
          </h1>
          <p className="text-slate-500 mt-1">Disponibilidad en tiempo real por SKU y ubicación.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar SKU o producto..." 
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64 shadow-sm"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors">
            <Filter size={16} /> Filtrar
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors">
            <Download size={16} /> Exportar
          </button>
        </div>
      </div>

      {/* Tabla Stock */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <th className="p-4 pl-6">Producto / SKU</th>
                <th className="p-4">Categoría</th>
                <th className="p-4 text-center">Central</th>
                <th className="p-4 text-center">Punto Venta 1</th>
                <th className="p-4 text-center bg-indigo-50/30 text-indigo-800">Total</th>
                <th className="p-4 text-center">Mínimo</th>
                <th className="p-4 pr-6 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {STOCK_MOCK.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 pl-6">
                    <div className="font-bold text-slate-800 mb-0.5">{item.producto}</div>
                    <div className="text-xs font-mono font-semibold text-slate-500">{item.sku}</div>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-bold">{item.categoria}</span>
                  </td>
                  <td className="p-4 text-center font-medium text-slate-700">{item.central}</td>
                  <td className="p-4 text-center font-medium text-slate-700">{item.sucursal1}</td>
                  <td className="p-4 text-center font-black text-indigo-700 bg-indigo-50/30 text-lg">{item.total}</td>
                  <td className="p-4 text-center text-xs font-bold text-slate-400">{item.minimo}</td>
                  <td className="p-4 pr-6 text-right">
                    {item.estado === 'ok' && (
                      <span className="inline-flex items-center text-green-600 bg-green-50 px-2.5 py-1 rounded-full text-xs font-bold">
                        <CheckCircle2 size={14} className="mr-1" /> Óptimo
                      </span>
                    )}
                    {item.estado === 'alert' && (
                      <span className="inline-flex items-center text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-200">
                        <AlertCircle size={14} className="mr-1" /> Bajo Stock
                      </span>
                    )}
                    {item.estado === 'critical' && (
                      <span className="inline-flex items-center text-white bg-red-500 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm shadow-red-200 animate-pulse">
                        <AlertCircle size={14} className="mr-1" /> Crítico
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
