\'use client\';

import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, AlertCircle, Plus, Search, RefreshCw, FileText,
  Clock, Package, DollarSign, Activity, ChevronRight, X, ArrowRight
} from 'lucide-react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function VentaPage() {
  const [ventas, setVentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pendiente');
  const [selectedVenta, setSelectedVenta] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchVentas = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/ventas/pedidos');
      setVentas(data.items || []);
    } catch (error) {
      console.error('Error fetching ventas:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVentas();
  }, []);

  const getFilteredVentas = () => {
    let filtered = ventas;
    if (activeTab === 'pendiente') {
      filtered = filtered.filter(v => !v.pec_id);
    } else if (activeTab === 'transito') {
      filtered = filtered.filter(v => v.pec_id && v.estado_compra === 'EN_TRANSITO');
    } else if (activeTab === 'completadas') {
      filtered = filtered.filter(v => v.estado === 'COMPLETADA');
    }

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(v => 
        (v.numero || '').toLowerCase().includes(lower) ||
        (v.cot_id || '').toLowerCase().includes(lower) ||
        (v.sc_id || '').toLowerCase().includes(lower) ||
        (v.cliente?.nombre || '').toLowerCase().includes(lower)
      );
    }
    return filtered;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Sub-modules Nav */}
      <nav className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 flex gap-6 overflow-x-auto">
        <Link href="/dashboard/ventas/solicitud" className="py-4 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent">Solicitud</Link>
        <Link href="/dashboard/ventas/cotizacion" className="py-4 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent">Cotizacion</Link>
        <Link href="/dashboard/ventas/venta" className="py-4 text-sm font-medium text-emerald-600 border-b-2 border-emerald-600">Venta</Link>
        <Link href="/dashboard/ventas/exportar-dia" className="py-4 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent">Exportar Dia</Link>
        <Link href="/dashboard/ventas/proyecciones" className="py-4 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent">Proyecciones</Link>
      </nav>

      {/* Alert Banner */}
      <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 mx-6 mt-6 rounded-r">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-emerald-500" />
          <div className="ml-3">
            <p className="text-sm text-emerald-700">
              Hay ventas sin PEC asignado o con saldo pendiente de pago.
            </p>
          </div>
        </div>
      </div>

      <main className="flex-1 p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
              <ShoppingCart size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Pedidos de Venta</h1>
              <p className="text-sm text-gray-500 mt-1">Gestiona los pedidos de venta confirmados.</p>
            </div>
          </div>
          <Link href="/dashboard/ventas/cotizacion" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow flex items-center gap-2">
            <Plus size={18} /> Nueva (desde COT)
          </Link>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:border-amber-200 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">Pendiente de Compra</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">0</h3>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600"><Clock size={20} /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:border-blue-200 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">En Transito</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">0</h3>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Package size={20} /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:border-indigo-200 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">Monto Total VEN</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">$0</h3>
              </div>
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><DollarSign size={20} /></div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow border-0 p-5 relative overflow-hidden text-white">
            <Activity className="absolute right-[-10px] bottom-[-10px] text-white/20 h-24 w-24" />
            <div className="relative z-10">
              <p className="text-sm font-medium text-emerald-100">Completadas (Mes)</p>
              <h3 className="text-2xl font-bold mt-1">0</h3>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex gap-4">
              <button onClick={() => setActiveTab('pendiente')} className={`pb-4 border-b-2 font-medium text-sm transition-colors -mb-[17px] ${activeTab === 'pendiente' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Pendiente Compra</button>
              <button onClick={() => setActiveTab('transito')} className={`pb-4 border-b-2 font-medium text-sm transition-colors -mb-[17px] ${activeTab === 'transito' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>En Transito</button>
              <button onClick={() => setActiveTab('completadas')} className={`pb-4 border-b-2 font-medium text-sm transition-colors -mb-[17px] ${activeTab === 'completadas' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Completadas</button>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" placeholder="Buscar venta..." 
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <button onClick={fetchVentas} className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 font-medium">VEN #</th>
                  <th className="px-6 py-3 font-medium">Cliente</th>
                  <th className="px-6 py-3 font-medium">Fecha VEN</th>
                  <th className="px-6 py-3 font-medium text-right">Total</th>
                  <th className="px-6 py-3 font-medium text-right">Anticipo</th>
                  <th className="px-6 py-3 font-medium text-right">Saldo</th>
                  <th className="px-6 py-3 font-medium">Estado</th>
                  <th className="px-6 py-3 font-medium">Compra (PEC)</th>
                  <th className="px-6 py-3 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {getFilteredVentas().length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                      <p className="text-gray-500 font-medium">No se encontraron resultados</p>
                    </td>
                  </tr>
                ) : (
                  getFilteredVentas().map(ven => (
                    <tr key={ven.id} className="hover:bg-gray-50 group">
                      <td className="px-6 py-4">
                        <button onClick={() => { setSelectedVenta(ven); setIsDrawerOpen(true); }} className="font-semibold text-emerald-700 hover:underline">{ven.numero}</button>
                        <div className="text-xs text-gray-400 mt-1 flex gap-1">
                          <span>COT {ven.cot_id}</span>
                          <span>|</span>
                          <span>SC {ven.sc_id}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">{ven.cliente?.nombre || 'N/A'}</td>
                      <td className="px-6 py-4 text-gray-600">{ven.fecha || 'N/A'}</td>
                      <td className="px-6 py-4 text-right font-medium text-gray-900">${ven.total || 0}</td>
                      <td className="px-6 py-4 text-right text-gray-600">${ven.anticipo || 0}</td>
                      <td className="px-6 py-4 text-right text-gray-600 font-medium">${(ven.total || 0) - (ven.anticipo || 0)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800`}>
                          {ven.estado || 'ACTIVA'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {ven.pec_id ? (
                          <Link href={`/dashboard/compras/pedidos?id=${ven.pec_id}`} className="text-blue-600 hover:underline">{ven.pec_id}</Link>
                        ) : (
                          <span className="text-gray-400 italic">Sin PEC</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!ven.pec_id && <button className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded hover:bg-blue-100 font-medium">Crear PEC</button>}
                          {!ven.pxp_id && <button onClick={() => { setSelectedVenta(ven); setIsModalOpen(true); }} className="px-2 py-1 bg-amber-50 text-amber-600 text-xs rounded hover:bg-amber-100 font-medium">Crear PXP</button>}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white shadow-2xl h-full flex flex-col transform transition-transform">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  Pedido Venta {selectedVenta?.numero}
                </h2>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Trazabilidad */}
              <div className="bg-white p-4 rounded-xl border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-3">Trazabilidad</h3>
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  <div className="px-3 py-1.5 bg-gray-100 rounded text-sm text-gray-600 shrink-0">SC {selectedVenta?.sc_id || 'N/A'}</div>
                  <ArrowRight size={14} className="text-gray-400 shrink-0" />
                  <div className="px-3 py-1.5 bg-amber-50 rounded text-sm text-amber-700 shrink-0">COT {selectedVenta?.cot_id || 'N/A'}</div>
                  <ArrowRight size={14} className="text-gray-400 shrink-0" />
                  <div className="px-3 py-1.5 bg-emerald-100 rounded text-sm text-emerald-800 font-medium shrink-0">VEN {selectedVenta?.numero}</div>
                  <ArrowRight size={14} className="text-gray-400 shrink-0" />
                  <div className={`px-3 py-1.5 rounded text-sm shrink-0 ${selectedVenta?.pec_id ? 'bg-purple-50 text-purple-700' : 'bg-gray-50 text-gray-400 italic border border-dashed border-gray-300'}`}>
                    {selectedVenta?.pec_id ? `PEC ${selectedVenta?.pec_id}` : 'Falta PEC'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal PXP */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Crear Pago (PXP)</h3>
            <div className="space-y-4 mb-6">
              <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 text-sm">Anticipo</span>
                <span className="font-medium">${selectedVenta?.anticipo || 0}</span>
              </div>
              <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 text-sm">Saldo Pendiente</span>
                <span className="font-medium text-red-600">${(selectedVenta?.total || 0) - (selectedVenta?.anticipo || 0)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancelar</button>
              <button className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700">Crear PXP</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
