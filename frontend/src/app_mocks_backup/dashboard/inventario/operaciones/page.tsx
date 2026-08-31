"use client";

import { ShoppingCart, Search, Filter, Plus, FileText, CheckCircle2, Truck, Clock } from 'lucide-react';

const PO_MOCK = [
  { id: 'PO-2026-0801', proveedor: 'Apple Inc.', items: 120, total: '$95,400', fechaEsperada: '2026-08-25', estado: 'En Tránsito' },
  { id: 'PO-2026-0802', proveedor: 'Textiles S.A.', items: 500, total: '$4,200', fechaEsperada: '2026-08-23', estado: 'Para Recepción' },
  { id: 'PO-2026-0803', proveedor: 'LG Electronics', items: 50, total: '$12,500', fechaEsperada: '2026-08-28', estado: 'Procesando' },
  { id: 'PO-2026-0799', proveedor: 'Logitech', items: 200, total: '$8,000', fechaEsperada: '2026-08-20', estado: 'Completada' },
];

export default function OperacionesPage() {
  return (
    <div className="p-8 h-full overflow-y-auto space-y-6 animate-in fade-in duration-500 custom-scrollbar bg-slate-50">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-amber-600 text-white rounded-lg shadow-md shadow-amber-200">
              <ShoppingCart size={24} />
            </div>
            Órdenes de Compra y Recepciones
          </h1>
          <p className="text-slate-500 mt-1">Control de abastecimiento, P.O.s y registro de entradas a bodega.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar PO, proveedor..." 
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none w-64 shadow-sm"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors">
            <Filter size={16} /> Filtros
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-bold text-sm shadow-md shadow-amber-200 transition-colors">
            <Plus size={16} /> Crear PO
          </button>
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Clock size={20}/></div>
          <div><p className="text-2xl font-black text-slate-800">12</p><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Procesando</p></div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg"><Truck size={20}/></div>
          <div><p className="text-2xl font-black text-slate-800">5</p><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">En Tránsito</p></div>
        </div>
        <div className="bg-white p-4 rounded-xl border-amber-400 border-2 shadow-sm flex items-center gap-4 bg-amber-50/30">
          <div className="p-3 bg-amber-100 text-amber-700 rounded-lg"><FileText size={20}/></div>
          <div><p className="text-2xl font-black text-amber-900">3</p><p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Para Recepción Hoy</p></div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-green-50 text-green-600 rounded-lg"><CheckCircle2 size={20}/></div>
          <div><p className="text-2xl font-black text-slate-800">145</p><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Completadas Mes</p></div>
        </div>
      </div>

      {/* Tabla POs */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <th className="p-4 pl-6">Orden (PO)</th>
                <th className="p-4">Proveedor</th>
                <th className="p-4 text-center">Items</th>
                <th className="p-4 text-right">Costo Total</th>
                <th className="p-4">Llegada Est.</th>
                <th className="p-4">Estado</th>
                <th className="p-4 pr-6 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {PO_MOCK.map((po, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 pl-6 font-bold text-slate-800 font-mono">{po.id}</td>
                  <td className="p-4 font-semibold text-slate-700">{po.proveedor}</td>
                  <td className="p-4 text-center font-medium text-slate-600">{po.items} unds</td>
                  <td className="p-4 text-right font-black text-slate-800">{po.total}</td>
                  <td className="p-4 font-medium text-slate-600 flex items-center gap-2">
                    {po.fechaEsperada}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      po.estado === 'Completada' ? 'bg-green-100 text-green-700' :
                      po.estado === 'En Tránsito' ? 'bg-blue-100 text-blue-700' :
                      po.estado === 'Para Recepción' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {po.estado === 'En Tránsito' && <Truck size={12} className="mr-1" />}
                      {po.estado === 'Para Recepción' && <FileText size={12} className="mr-1" />}
                      {po.estado === 'Completada' && <CheckCircle2 size={12} className="mr-1" />}
                      {po.estado}
                    </span>
                  </td>
                  <td className="p-4 pr-6 text-right">
                    {po.estado === 'Para Recepción' ? (
                      <button className="px-3 py-1.5 bg-amber-500 text-white font-bold text-xs rounded-lg hover:bg-amber-600 shadow-sm shadow-amber-200">
                        Registrar Entrada
                      </button>
                    ) : (
                      <button className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-50">
                        Ver Detalles
                      </button>
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
