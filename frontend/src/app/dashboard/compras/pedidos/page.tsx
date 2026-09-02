'use client';

import React, { useState, useEffect } from 'react';
import { Package, Truck, DollarSign, Activity, AlertCircle, Plus, Search, RefreshCw, X, ChevronRight, Eye, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function PedidosPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Activos');
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isModalOpen, setModalOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState(null);

  useEffect(() => {
    setLoading(false);
    setData([
      { id: 'PEC-2026-001', proveedor: 'Tech Supply Co', fecha: '2026-09-01', entrega: '2026-09-10', total: 1500000, estado: 'ENVIADO', days: 9 },
      { id: 'PEC-2026-002', proveedor: 'Global Parts', fecha: '2026-08-25', entrega: '2026-08-30', total: 3200000, estado: 'OVERDUE', days: -2 }
    ]);
  }, []);

  const openDrawer = (pedido: any) => {
    setSelectedPedido(pedido);
    setDrawerOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Nav */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex gap-6 text-sm font-medium overflow-x-auto">
        <Link href="/dashboard/compras/lista-compras" className="text-gray-500 hover:text-gray-900 whitespace-nowrap">Lista de Compras</Link>
        <Link href="/dashboard/compras/pedidos" className="text-purple-600 border-b-2 border-purple-600 pb-3 -mb-3 whitespace-nowrap">Pedidos de Compra</Link>
        <Link href="/dashboard/compras/transito" className="text-gray-500 hover:text-gray-900 whitespace-nowrap">Mercancia en Transito</Link>
        <Link href="/dashboard/compras/recepciones" className="text-gray-500 hover:text-gray-900 whitespace-nowrap">Recepciones (Entrada)</Link>
        <Link href="/dashboard/compras/traslados" className="text-gray-500 hover:text-gray-900 whitespace-nowrap">Traslados Internos</Link>
        <Link href="/dashboard/compras/registro" className="text-gray-500 hover:text-gray-900 whitespace-nowrap">Registro OCR/Manual</Link>
        <Link href="/dashboard/compras/proyecciones" className="text-gray-500 hover:text-gray-900 whitespace-nowrap">Proyecciones</Link>
      </div>

      {/* Alert */}
      <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mx-6 mt-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
        <div>
          <h3 className="text-orange-800 font-medium text-sm">Atencion Requerida</h3>
          <p className="text-orange-700 text-sm mt-1">Existen PECs vencidos con entrega overdue o sin proveedor asignado.</p>
        </div>
      </div>

      {/* Header */}
      <div className="px-6 mt-6 flex justify-between items-start">
        <div className="flex gap-4 items-center">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pedidos de Compra</h1>
            <p className="text-gray-500 text-sm">Gestiona ordenes de compra a proveedores</p>
          </div>
        </div>
        <button onClick={() => setModalOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium shadow-sm transition-colors">
          <Plus className="w-4 h-4" /> Nuevo PEC
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-6 px-6 mt-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-purple-300 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm font-medium">Pedidos Activos</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-2">142</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <Package className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-blue-300 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm font-medium">En Transito</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-2">28</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Truck className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-indigo-300 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm font-medium">Monto en Compras</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-2">$42.5M</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-indigo-700 p-6 rounded-xl text-white relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-purple-100 text-sm font-medium">Recibidos (Mes)</p>
            <h3 className="text-2xl font-bold mt-2">85</h3>
          </div>
          <Activity className="absolute right-[-10%] bottom-[-20%] w-32 h-32 text-white/10" />
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-6 mt-8 flex-1 bg-white rounded-t-xl border border-gray-200 border-b-0 overflow-hidden flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <div className="flex gap-6">
            {['Activos', 'En Transito', 'Recibidos'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`text-sm font-medium pb-4 -mb-4 border-b-2 transition-colors ${activeTab === tab ? (tab === 'Activos' ? 'border-purple-600 text-purple-700' : tab === 'En Transito' ? 'border-blue-600 text-blue-700' : 'border-emerald-600 text-emerald-700') : 'border-transparent text-gray-500 hover:text-gray-900'}`}>{tab}</button>
            ))}
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input type="text" placeholder="Buscar PEC..." className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 w-64" />
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
                <th className="px-6 py-3">PEC #</th>
                <th className="px-6 py-3">Proveedor</th>
                <th className="px-6 py-3">Fecha Compra</th>
                <th className="px-6 py-3">Entrega Est.</th>
                <th className="px-6 py-3">Total COP</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3">Timer</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {data.map((row: any, i) => (
                <tr key={i} className="hover:bg-gray-50 group">
                  <td className="px-6 py-4 font-medium text-purple-600 cursor-pointer" onClick={() => openDrawer(row)}>{row.id}</td>
                  <td className="px-6 py-4 text-gray-900">{row.proveedor}</td>
                  <td className="px-6 py-4 text-gray-500">{row.fecha}</td>
                  <td className="px-6 py-4 text-gray-500">{row.entrega}</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">${row.total.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${row.estado === 'OVERDUE' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{row.estado}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`flex items-center gap-1 font-medium ${row.days < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                      <AlertCircle className="w-3.5 h-3.5" />
                      {row.days < 0 ? `-${Math.abs(row.days)} dias` : `${row.days} dias`}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="px-3 py-1 bg-white border border-gray-300 rounded text-xs font-medium hover:bg-gray-50">Ver Tracking</button>
                      <button className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700">Recepcionar</button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p>No hay pedidos para mostrar</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer Overlay */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/20 backdrop-blur-sm">
          <div className="w-[600px] bg-white h-full shadow-2xl flex flex-col animate-slide-left">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">{selectedPedido?.id}</h2>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-md">{selectedPedido?.estado}</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-8">
              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Detalles del Proveedor</h3>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <p className="font-medium">{selectedPedido?.proveedor}</p>
                </div>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Tracking</h3>
                <div className="flex gap-4">
                  {[1, 2, 3, 4].map(step => (
                    <div key={step} className="flex-1 text-center">
                      <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-sm font-medium mb-2 ${step <= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{step}</div>
                      <p className="text-xs text-gray-600">Fase {step}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cerrar</button>
              <button className="px-4 py-2 bg-purple-600 rounded-lg text-sm font-medium text-white hover:bg-purple-700">Editar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">Nuevo Pedido de Compra</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex-1 overflow-auto space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
                <input type="text" placeholder="Buscar proveedor..." className="w-full p-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Productos</label>
                <div className="border border-gray-200 rounded-lg p-4 text-center text-sm text-gray-500">
                  Sin productos agregados
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bodega Destino</label>
                  <select className="w-full p-2 border border-gray-300 rounded-lg"><option>Principal</option></select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dias Entrega</label>
                  <input type="number" className="w-full p-2 border border-gray-300 rounded-lg" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white">Cancelar</button>
              <button className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium">Crear Pedido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
