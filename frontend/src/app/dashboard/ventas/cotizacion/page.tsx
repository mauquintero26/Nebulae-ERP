\'use client\';

import React, { useState, useEffect } from 'react';
import { 
  Calculator, Clock, CheckCircle2, DollarSign, Activity,
  Search, RefreshCw, FileText, ChevronRight, X, AlertCircle,
  Phone, Mail, MapPin, Edit, Check, ArrowRight, Plus
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

export default function CotizacionPage() {
  const [cotizaciones, setCotizaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('activas');
  const [selectedCotizacion, setSelectedCotizacion] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchCotizaciones = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/ventas/cotizaciones');
      setCotizaciones(data.items || []);
    } catch (error) {
      console.error('Error fetching cotizaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCotizaciones();
  }, []);

  const getFilteredCotizaciones = () => {
    let filtered = cotizaciones;
    if (activeTab === 'activas') {
      filtered = filtered.filter(c => ['BORRADOR', 'ENVIADA', 'PENDIENTE'].includes(c.estado));
    } else if (activeTab === 'confirmadas') {
      filtered = filtered.filter(c => c.estado === 'CONFIRMADA');
    } else if (activeTab === 'rechazadas') {
      filtered = filtered.filter(c => c.estado === 'RECHAZADA');
    }

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(c => 
        (c.numero || '').toLowerCase().includes(lower) ||
        (c.cliente?.nombre || '').toLowerCase().includes(lower) ||
        (c.cotizador?.nombre || '').toLowerCase().includes(lower)
      );
    }
    return filtered;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Sub-modules Nav */}
      <nav className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 flex gap-6 overflow-x-auto">
        <Link href="/dashboard/ventas/solicitud" className="py-4 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent">Solicitud</Link>
        <Link href="/dashboard/ventas/cotizacion" className="py-4 text-sm font-medium text-amber-600 border-b-2 border-amber-600">Cotizacion</Link>
        <Link href="/dashboard/ventas/venta" className="py-4 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent">Venta</Link>
        <Link href="/dashboard/ventas/exportar-dia" className="py-4 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent">Exportar Dia</Link>
        <Link href="/dashboard/ventas/proyecciones" className="py-4 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent">Proyecciones</Link>
      </nav>

      {/* Alert Banner */}
      <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mx-6 mt-6 rounded-r">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <div className="ml-3">
            <p className="text-sm text-amber-700">
              Hay cotizaciones sin confirmar &gt; 72h o venciendo hoy.
            </p>
          </div>
        </div>
      </div>

      <main className="flex-1 p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
              <Calculator size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Cotizaciones</h1>
              <p className="text-sm text-gray-500 mt-1">Administra las propuestas comerciales enviadas a clientes.</p>
            </div>
          </div>
          <Link href="/dashboard/ventas/solicitud" className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium shadow flex items-center gap-2">
            <Plus size={18} /> Nueva Cotizacion
          </Link>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:border-amber-200 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">Cotizaciones Activas</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">0</h3>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600"><Clock size={20} /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:border-emerald-200 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">Confirmadas (VEN)</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">0</h3>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><CheckCircle2 size={20} /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:border-blue-200 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">Monto Total</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">$0</h3>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><DollarSign size={20} /></div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow border-0 p-5 relative overflow-hidden text-white">
            <Activity className="absolute right-[-10px] bottom-[-10px] text-white/20 h-24 w-24" />
            <div className="relative z-10">
              <p className="text-sm font-medium text-orange-100">Por Vencer (7 dias)</p>
              <h3 className="text-2xl font-bold mt-1">0</h3>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex gap-4">
              <button onClick={() => setActiveTab('activas')} className={`pb-4 border-b-2 font-medium text-sm transition-colors -mb-[17px] ${activeTab === 'activas' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Activas</button>
              <button onClick={() => setActiveTab('confirmadas')} className={`pb-4 border-b-2 font-medium text-sm transition-colors -mb-[17px] ${activeTab === 'confirmadas' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Confirmadas</button>
              <button onClick={() => setActiveTab('rechazadas')} className={`pb-4 border-b-2 font-medium text-sm transition-colors -mb-[17px] ${activeTab === 'rechazadas' ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Rechazadas</button>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" placeholder="Buscar cotizacion..." 
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <button onClick={fetchCotizaciones} className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 font-medium">COT #</th>
                  <th className="px-6 py-3 font-medium">Cliente/Cotizador</th>
                  <th className="px-6 py-3 font-medium">Fecha COT</th>
                  <th className="px-6 py-3 font-medium">Entrega Est.</th>
                  <th className="px-6 py-3 font-medium text-right">Total COP</th>
                  <th className="px-6 py-3 font-medium text-right">Anticipo</th>
                  <th className="px-6 py-3 font-medium">Estado</th>
                  <th className="px-6 py-3 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {getFilteredCotizaciones().length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                      <p className="text-gray-500 font-medium">No se encontraron resultados</p>
                    </td>
                  </tr>
                ) : (
                  getFilteredCotizaciones().map(cot => (
                    <tr key={cot.id} className="hover:bg-gray-50 group">
                      <td className="px-6 py-4">
                        <button onClick={() => { setSelectedCotizacion(cot); setIsDrawerOpen(true); }} className="font-semibold text-amber-700 hover:underline">{cot.numero}</button>
                        {cot.sc_id && <div className="text-xs text-gray-400 mt-1">SC {cot.sc_id}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{cot.cliente?.nombre || 'N/A'}</div>
                        <div className="text-xs text-gray-500">{cot.cotizador?.nombre || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{cot.fecha || 'N/A'}</td>
                      <td className="px-6 py-4 text-gray-600">{cot.fecha_entrega_est || 'N/A'}</td>
                      <td className="px-6 py-4 text-right font-medium text-gray-900">${cot.total_cop || 0}</td>
                      <td className="px-6 py-4 text-right text-gray-600">${cot.anticipo || 0}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cot.estado === 'CONFIRMADA' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {cot.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200" title="Editar productos"><Edit size={14} /></button>
                          {cot.estado !== 'CONFIRMADA' && (
                            <button className="p-1.5 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100" title="Confirmar + VEN"><Check size={14} /></button>
                          )}
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
                  Cotizacion {selectedCotizacion?.numero}
                  <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 font-medium">{selectedCotizacion?.estado}</span>
                </h2>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Cliente */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-3">Cliente</h3>
                <div className="space-y-2">
                  <p className="font-medium">{selectedCotizacion?.cliente?.nombre || 'Nombre del cliente'}</p>
                  <div className="flex items-center gap-2 text-sm text-gray-600 hover:text-amber-600 cursor-pointer"><Phone size={14} /> {selectedCotizacion?.cliente?.telefono || 'N/A'}</div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 hover:text-amber-600 cursor-pointer"><Mail size={14} /> {selectedCotizacion?.cliente?.email || 'N/A'}</div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 hover:text-amber-600 cursor-pointer"><MapPin size={14} /> {selectedCotizacion?.cliente?.direccion || 'N/A'}</div>
                </div>
              </div>

              {/* Trazabilidad */}
              <div className="bg-white p-4 rounded-xl border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-3">Trazabilidad</h3>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1.5 bg-gray-100 rounded text-sm text-gray-600">SC {selectedCotizacion?.sc_id || 'N/A'}</div>
                  <ArrowRight size={14} className="text-gray-400" />
                  <div className="px-3 py-1.5 bg-amber-100 rounded text-sm text-amber-700 font-medium">COT {selectedCotizacion?.numero}</div>
                  <ArrowRight size={14} className="text-gray-400" />
                  <div className="px-3 py-1.5 bg-emerald-50 rounded text-sm text-emerald-600">{selectedCotizacion?.ven_id ? `VEN ${selectedCotizacion?.ven_id}` : 'Sin VEN'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
