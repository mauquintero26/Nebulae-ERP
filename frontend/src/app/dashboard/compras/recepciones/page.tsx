'use client';

import React, { useState } from 'react';
import { PackageCheck, Activity, Search, RefreshCw, X, ChevronRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function RecepcionesPage() {
  const [data, setData] = useState([
    { id: 'ENINV-1001', pec: 'PEC-2026-005', proveedor: 'Global Parts', bodega: 'Principal', fecha: '2026-09-01', items: 12, estado: 'PENDIENTE', stock: false },
    { id: 'ENINV-1002', pec: 'PEC-2026-003', proveedor: 'Tech Supply', bodega: 'Secundaria', fecha: '2026-08-28', items: 5, estado: 'COMPLETADA', stock: true }
  ]);
  const [activeTab, setActiveTab] = useState('Pendientes');
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex gap-6 text-sm font-medium">
        <Link href="/dashboard/compras/pedidos" className="text-gray-500 hover:text-gray-900">Pedidos de Compra</Link>
        <Link href="/dashboard/compras/transito" className="text-gray-500 hover:text-gray-900">Mercancia en Transito</Link>
        <Link href="/dashboard/compras/recepciones" className="text-teal-600 border-b-2 border-teal-600 pb-3 -mb-3">Recepciones (Entrada)</Link>
        <Link href="/dashboard/compras/traslados" className="text-gray-500 hover:text-gray-900">Traslados Internos</Link>
        <Link href="/dashboard/compras/registro" className="text-gray-500 hover:text-gray-900">Registro OCR/Manual</Link>
        <Link href="/dashboard/compras/proyecciones" className="text-gray-500 hover:text-gray-900">Proyecciones</Link>
      </div>

      <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mx-6 mt-6 flex items-start gap-3">
        <Activity className="w-5 h-5 text-orange-600 mt-0.5" />
        <div>
          <h3 className="text-orange-800 font-medium text-sm">Accion Requerida</h3>
          <p className="text-orange-700 text-sm mt-1">Hay recepciones pendientes de confirmar (stock sin actualizar).</p>
        </div>
      </div>

      <div className="px-6 mt-6 flex justify-between items-start">
        <div className="flex gap-4 items-center">
          <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center text-teal-600">
            <PackageCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Recepciones de Inventario</h1>
            <p className="text-gray-500 text-sm">Gestiona entradas de mercancia al inventario</p>
          </div>
        </div>
        <Link href="/dashboard/compras/pedidos" className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 font-medium shadow-sm transition-colors">
          Ir a Pedidos
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-6 px-6 mt-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-amber-300 transition-colors">
          <p className="text-gray-500 text-sm font-medium">Pendientes de Confirmar</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-2">12</h3>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-emerald-300 transition-colors">
          <p className="text-gray-500 text-sm font-medium">Completadas (Mes)</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-2">45</h3>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-blue-300 transition-colors">
          <p className="text-gray-500 text-sm font-medium">Stock Actualizado</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-2">89%</h3>
        </div>
        <div className="bg-gradient-to-br from-teal-600 to-emerald-700 p-6 rounded-xl text-white">
          <p className="text-teal-100 text-sm font-medium">En Proceso</p>
          <h3 className="text-2xl font-bold mt-2">5</h3>
        </div>
      </div>

      <div className="mx-6 mt-8 flex-1 bg-white rounded-t-xl border border-gray-200 border-b-0 overflow-hidden flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <div className="flex gap-6">
            {['Pendientes', 'Completadas', 'Todas'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`text-sm font-medium pb-4 -mb-4 border-b-2 transition-colors ${activeTab === tab ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>{tab}</button>
            ))}
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input type="text" placeholder="Buscar ENINV, PEC..." className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-64" />
            </div>
            <button className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold">
              <tr>
                <th className="px-6 py-3">ENINV #</th>
                <th className="px-6 py-3">PEC Origen</th>
                <th className="px-6 py-3">Proveedor</th>
                <th className="px-6 py-3">Bodega</th>
                <th className="px-6 py-3">Fecha Recepcion</th>
                <th className="px-6 py-3">Productos</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3">Stock</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 group">
                  <td className="px-6 py-4 font-medium text-teal-600 cursor-pointer" onClick={() => {setSelectedItem(row); setDrawerOpen(true);}}>{row.id}</td>
                  <td className="px-6 py-4 text-blue-600 cursor-pointer">{row.pec}</td>
                  <td className="px-6 py-4 text-gray-900">{row.proveedor}</td>
                  <td className="px-6 py-4 text-gray-500">{row.bodega}</td>
                  <td className="px-6 py-4 text-gray-500">{row.fecha}</td>
                  <td className="px-6 py-4 text-gray-900">{row.items} items</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${row.estado === 'PENDIENTE' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{row.estado}</span>
                  </td>
                  <td className="px-6 py-4">
                    {row.stock ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {row.estado === 'PENDIENTE' && (
                        <button className="px-3 py-1 bg-teal-600 text-white rounded text-xs font-medium hover:bg-teal-700">Confirmar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/20 backdrop-blur-sm">
          <div className="w-[600px] bg-white h-full shadow-2xl flex flex-col animate-slide-left">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">{selectedItem?.id}</h2>
                <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-md">{selectedItem?.estado}</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-500">PEC Origen</p>
                  <p className="font-medium text-blue-600">{selectedItem?.pec}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-500">Bodega</p>
                  <p className="font-medium">{selectedItem?.bodega}</p>
                </div>
              </div>
              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Productos</h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500">Producto</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500">Esperado</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500">Recibido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      <tr>
                        <td className="px-4 py-3">Item A</td>
                        <td className="px-4 py-3">10</td>
                        <td className="px-4 py-3">
                          <input type="number" defaultValue="10" className="w-16 p-1 border border-gray-300 rounded text-center" disabled={selectedItem?.estado !== 'PENDIENTE'} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cerrar</button>
              {selectedItem?.estado === 'PENDIENTE' && (
                <button className="px-4 py-2 bg-teal-600 rounded-lg text-sm font-medium text-white hover:bg-teal-700">Confirmar Recepcion</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
