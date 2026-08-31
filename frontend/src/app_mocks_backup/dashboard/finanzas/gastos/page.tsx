"use client";

import { CreditCard, Search, Filter, Plus, DollarSign, Download } from 'lucide-react';
import { useState } from 'react';

const GASTOS_MOCK = [
  { id: 'EXP-401', fecha: '2026-08-23', categoria: 'Pauta Digital', concepto: 'Meta Ads Campaign (Agosto)', monto: '$1,200.00', tipo: 'Variable', estado: 'Pagado' },
  { id: 'EXP-402', fecha: '2026-08-20', categoria: 'Nómina', concepto: 'Salarios 1ra Quincena', monto: '$4,500.00', tipo: 'Recurrente', estado: 'Pagado' },
  { id: 'EXP-403', fecha: '2026-08-15', categoria: 'Arriendo', concepto: 'Bodega Central', monto: '$2,800.00', tipo: 'Recurrente', estado: 'Pagado' },
  { id: 'EXP-404', fecha: '2026-08-12', categoria: 'Suscripciones', concepto: 'AWS & Vercel Hosting', monto: '$150.00', tipo: 'Recurrente', estado: 'Pagado' },
  { id: 'EXP-405', fecha: '2026-08-10', categoria: 'Equipos', concepto: 'Reparación Computador Caja', monto: '$85.00', tipo: 'Variable', estado: 'Pendiente' },
];

export default function GastosPage() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="p-8 h-full overflow-y-auto space-y-6 animate-in fade-in duration-500 custom-scrollbar bg-slate-50">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-rose-600 text-white rounded-lg shadow-md shadow-rose-200">
              <CreditCard size={24} />
            </div>
            Control de Gastos (OPEX)
          </h1>
          <p className="text-slate-500 mt-1">Gestión de nómina, pauta, arriendos y otros gastos operativos.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar gasto..." 
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 outline-none w-64 shadow-sm"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors">
            <Filter size={16} /> Filtros
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-bold text-sm shadow-md shadow-rose-200 transition-colors">
            <Plus size={16} /> Añadir Gasto
          </button>
        </div>
      </div>

      {/* Tabla OPEX */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <th className="p-4 pl-6">ID / Fecha</th>
                <th className="p-4">Categoría</th>
                <th className="p-4">Concepto</th>
                <th className="p-4">Tipo</th>
                <th className="p-4 text-right">Monto (USD)</th>
                <th className="p-4 pr-6 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {GASTOS_MOCK.map((gasto) => (
                <tr key={gasto.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 pl-6">
                    <div className="font-bold text-slate-800 font-mono">{gasto.id}</div>
                    <div className="text-xs text-slate-500">{gasto.fecha}</div>
                  </td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-bold border border-slate-200">
                      {gasto.categoria}
                    </span>
                  </td>
                  <td className="p-4 font-medium text-slate-600">{gasto.concepto}</td>
                  <td className="p-4">
                    <span className={`text-xs font-bold ${gasto.tipo === 'Recurrente' ? 'text-blue-600' : 'text-amber-600'}`}>
                      {gasto.tipo}
                    </span>
                  </td>
                  <td className="p-4 text-right font-black text-slate-800 text-base">{gasto.monto}</td>
                  <td className="p-4 pr-6 text-right">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      gasto.estado === 'Pagado' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {gasto.estado}
                    </span>
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
