'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  PackageCheck, Activity, Search, RefreshCw, X, ChevronRight,
  CheckCircle2, AlertCircle, Clock, Truck, ShieldCheck, ArrowRight,
  Plus, Warehouse, User, Info, Check
} from 'lucide-react';
import Link from 'next/link';
import { apiFetch as _apiFetch } from '@/lib/api';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error al procesar solicitud');
  return data.data ?? data;
}

const SUB_MODULES = [
  { name: 'Lista de Compras',      path: '/dashboard/compras/lista-compras' },
  { name: 'Pedidos de Compra',     path: '/dashboard/compras/pedidos' },
  { name: 'Mercancia en Transito', path: '/dashboard/compras/transito' },
  { name: 'Recepciones (Entrada)', path: '/dashboard/compras/recepciones' },
  { name: 'Traslados Internos',    path: '/dashboard/compras/traslados' },
  { name: 'Registro OCR/Manual',   path: '/dashboard/compras/registro' },
  { name: 'Proyecciones',          path: '/dashboard/compras/proyecciones' },
];

const fCOP = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);
const fDate = (d: any) => d ? new Date(d).toLocaleDateString('es-CO', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

export default function RecepcionesPage() {
  const [recepciones, setRecepciones] = useState<any[]>([]);
  const [pecsEnTransito, setPecsEnTransito] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'Pendientes' | 'Completadas' | 'Todas'>('Pendientes');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'error' } | null>(null);

  // Modal para iniciar recepcion desde un PEC
  const [showPecModal, setShowPecModal] = useState(false);
  const [creatingFromPec, setCreatingFromPec] = useState<number | null>(null);

  const showToast = (msg: string, type: 'ok' | 'error' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [recs, pecs] = await Promise.all([
        apiFetch('/compras/recepciones?limit=100').catch(() => []),
        apiFetch('/compras/pedidos?limit=100').catch(() => []),
      ]);
      const recList = Array.isArray(recs) ? recs : (recs?.data ?? []);
      const pecList = Array.isArray(pecs) ? pecs : (pecs?.data ?? []);

      setRecepciones(recList);
      // Filtrar PECs que esten en camino o listos para recepcion fisica
      setPecsEnTransito(pecList.filter((p: any) => 
        ['EN_TRANSITO', 'ORDENADO', 'CONFIRMADO', 'EN_CASILLERO_MIAMI', 'EN_ADUANA_DIAN', 'RECIBIDO_BODEGA'].includes(p.estado)
      ));
    } catch {
      showToast('Error al cargar recepciones', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCrearDesdePec = async (pecId: number) => {
    setCreatingFromPec(pecId);
    try {
      const user = localStorage.getItem('user_name') || 'Mesa de Recepcion';
      const res = await apiFetch(`/compras/pedidos/${pecId}/recepcionar`, {
        method: 'POST',
        body: JSON.stringify({
          created_by: user,
          force_full: false,
          notas: 'Recepcion generada en Mesa de Entrada'
        })
      });
      showToast('Recepcion ENINV creada exitosamente');
      setShowPecModal(false);
      await loadData();
      if (res?.data || res) {
        setSelectedItem(res?.data || res);
        setDrawerOpen(true);
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setCreatingFromPec(null);
    }
  };

  const handleConfirmarRecepcion = async (recId: number) => {
    setConfirming(true);
    try {
      const user = localStorage.getItem('user_name') || 'Operario Bodega';
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      await apiFetch(`/compras/recepciones/${recId}/confirmar`, {
        method: 'POST',
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          receipt_type: 'FISICA',
          user_name: user,
          notas: 'Confirmado en mesa de recepcion Nebulae'
        })
      });

      showToast('Recepcion confirmada y stock actualizado correctamente');
      setDrawerOpen(false);
      loadData();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setConfirming(false);
    }
  };

  const pendientesCount = recepciones.filter(r => r.estado === 'PENDIENTE' || !r.stock_actualizado).length;
  const completadasCount = recepciones.filter(r => r.estado === 'COMPLETADA' || r.stock_actualizado).length;

  const filtered = recepciones.filter(r => {
    const term = search.toLowerCase();
    const match = !search || 
      (r.numero || '').toLowerCase().includes(term) ||
      (r.pec_numero || '').toLowerCase().includes(term) ||
      (r.proveedor_nombre || '').toLowerCase().includes(term);

    if (!match) return false;
    if (activeTab === 'Pendientes') return r.estado === 'PENDIENTE' || !r.stock_actualizado;
    if (activeTab === 'Completadas') return r.estado === 'COMPLETADA' || r.stock_actualizado;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col animate-in fade-in">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold flex items-center gap-2 ${
          toast.type === 'ok' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.type === 'ok' ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
          {toast.msg}
        </div>
      )}

      {/* Sub-module Navigation */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-3 shrink-0">Compras:</span>
        {SUB_MODULES.map(mod => (
          <Link key={mod.name} href={mod.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ${
              mod.path === '/dashboard/compras/recepciones'
                ? 'bg-teal-600 text-white border-teal-600'
                : 'text-slate-600 hover:bg-teal-50 hover:text-teal-700 border-transparent hover:border-teal-200'
            }`}>{mod.name}
          </Link>
        ))}
      </div>

      {/* Banner de Accion Requerida */}
      {pendientesCount > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mx-6 mt-6 rounded-r-xl flex items-start justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <Activity className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-amber-900 font-bold text-sm">Mesa de Recepcion Activa</h3>
              <p className="text-amber-700 text-xs mt-0.5">
                Hay <strong>{pendientesCount}</strong> recepcion(es) pendientes de conteo y verificacion fisica en bodega.
              </p>
            </div>
          </div>
          <button 
            onClick={() => setShowPecModal(true)}
            className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm shrink-0"
          >
            + Nueva Entrada desde PEC
          </button>
        </div>
      )}

      {/* Titulo y Acciones */}
      <div className="px-6 mt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex gap-4 items-center">
          <div className="w-12 h-12 rounded-2xl bg-teal-100 flex items-center justify-center text-teal-600 shadow-sm">
            <PackageCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Mesa de Recepciones Físico-Digital</h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Inspección física y separación por destino: <strong>Cliente</strong> (despacho), <strong>Stock Nebulae</strong> (disponible) y <strong>Socio Mau</strong>.
            </p>
          </div>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => setShowPecModal(true)}
            className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs font-bold shadow-sm transition-all"
          >
            <Plus size={15} /> Recepcionar PEC
          </button>
          <button
            onClick={loadData}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-xs font-bold shadow-sm transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 px-6 mt-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase">Pendientes Mesa</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <h3 className="text-3xl font-black text-slate-800">{pendientesCount}</h3>
          <p className="text-xs text-amber-600 font-medium mt-1">Por confirmar entrada física</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase">Confirmadas</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <h3 className="text-3xl font-black text-slate-800">{completadasCount}</h3>
          <p className="text-xs text-emerald-600 font-medium mt-1">Stock ingresado al ERP</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase">PECs en Tránsito</span>
            <Truck size={16} className="text-blue-500" />
          </div>
          <h3 className="text-3xl font-black text-slate-800">{pecsEnTransito.length}</h3>
          <p className="text-xs text-blue-600 font-medium mt-1">En camino o aduana</p>
        </div>

        <div className="bg-gradient-to-br from-teal-600 to-emerald-700 p-5 rounded-2xl text-white shadow-md">
          <div className="flex items-center justify-between text-teal-100 mb-2">
            <span className="text-xs font-bold uppercase">Regla de Separación</span>
            <ShieldCheck size={16} />
          </div>
          <p className="text-xs leading-relaxed opacity-95">
            Los ítems de <strong>Cliente</strong> no se mezclan con stock libre; van directamente a la cola de despacho y saldo del 40%.
          </p>
        </div>
      </div>

      {/* Tabla Principal */}
      <div className="mx-6 my-6 flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-6 py-4 border-b border-slate-200 bg-slate-50/50 gap-4">
          <div className="flex gap-2">
            {(['Pendientes', 'Completadas', 'Todas'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${
                  activeTab === tab
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar ENINV, PEC, Proveedor..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 w-full bg-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/80 sticky top-0 z-10 border-b border-slate-200 text-[11px] uppercase text-slate-400 font-black">
              <tr>
                <th className="px-6 py-3.5">Recepción #</th>
                <th className="px-6 py-3.5">PEC Origen</th>
                <th className="px-6 py-3.5">Proveedor</th>
                <th className="px-6 py-3.5">Bodega</th>
                <th className="px-6 py-3.5">Fecha</th>
                <th className="px-6 py-3.5 text-center">Ítems</th>
                <th className="px-6 py-3.5">Estado</th>
                <th className="px-6 py-3.5 text-center">Stock</th>
                <th className="px-6 py-3.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    <RefreshCw size={24} className="animate-spin text-teal-500 mx-auto mb-2" />
                    Cargando recepciones de inventario...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    <PackageCheck size={36} className="mx-auto mb-2 opacity-30" />
                    <p className="font-bold text-slate-600">No se encontraron recepciones en este filtro</p>
                    <p className="text-[11px] text-slate-400 mt-1">Usa "+ Recepcionar PEC" para iniciar la entrada física de un pedido.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((row, i) => {
                  const isPending = row.estado === 'PENDIENTE' || !row.stock_actualizado;
                  return (
                    <tr key={row.id || i} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-3.5 font-black text-teal-700 cursor-pointer" onClick={() => { setSelectedItem(row); setDrawerOpen(true); }}>
                        {row.numero || `ENINV-${row.id}`}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-purple-700">
                        {row.pec_numero || (row.pec_id ? `PEC-${row.pec_id}` : 'Manual')}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-slate-800">
                        {row.supplier_name || row.proveedor_nombre || 'Proveedor Nebulae'}
                      </td>
                      <td className="px-6 py-3.5 text-slate-600">
                        {row.warehouse_name || 'Bodega Principal'}
                      </td>
                      <td className="px-6 py-3.5 text-slate-500">
                        {fDate(row.fecha_recepcion || row.created_at)}
                      </td>
                      <td className="px-6 py-3.5 text-center font-bold text-slate-700">
                        {(row.lineas || row.productos || []).length || row.items_count || 1}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                          isPending ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {row.estado || (isPending ? 'PENDIENTE' : 'COMPLETADA')}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {row.stock_actualizado ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 size={12}/> Sí
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold">Pendiente</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => { setSelectedItem(row); setDrawerOpen(true); }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                          >
                            Inspeccionar
                          </button>
                          {isPending && (
                            <button
                              onClick={() => handleConfirmarRecepcion(row.id)}
                              disabled={confirming}
                              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
                            >
                              Confirmar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL SELECCIONAR PEC PARA RECEPCIONAR */}
      {showPecModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800">Iniciar Entrada desde Pedido de Compra</h3>
                <p className="text-xs text-slate-400 mt-0.5">Selecciona el embarque que acaba de llegar físicamente a la mesa de bodega</p>
              </div>
              <button onClick={() => setShowPecModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-3">
              {pecsEnTransito.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">
                  <Truck size={36} className="mx-auto mb-2 opacity-30" />
                  No hay pedidos de compra activos para recepcionar.
                </div>
              ) : (
                pecsEnTransito.map((pec: any) => (
                  <div key={pec.id} className="p-4 border border-slate-200 rounded-2xl hover:border-teal-400 transition-colors flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-purple-700 text-sm">{pec.numero}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{pec.estado}</span>
                        {pec.ven_numero && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                            Cliente: {pec.ven_numero}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-700 mt-1">{pec.supplier_name || 'Proveedor'}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Entrega est.: {fDate(pec.fecha_entrega_estimada)} · {fCOP(pec.total_cop)}</p>
                    </div>
                    <button
                      onClick={() => handleCrearDesdePec(pec.id)}
                      disabled={creatingFromPec === pec.id}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                    >
                      {creatingFromPec === pec.id ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : (
                        <PackageCheck size={14} />
                      )}
                      Recepcionar
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setShowPecModal(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER DETALLE DE RECEPCION Y SEPARACION POR DESTINO */}
      {isDrawerOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col">
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl font-black text-slate-800">{selectedItem.numero || `ENINV-${selectedItem.id}`}</h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    selectedItem.estado === 'COMPLETADA' || selectedItem.stock_actualizado
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {selectedItem.estado || 'PENDIENTE'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Inspección Física y Clasificación de Líneas en Mesa de Entrada
                </p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase">PEC Asociado</p>
                  <p className="font-bold text-sm text-purple-700 mt-0.5">{selectedItem.pec_numero || (selectedItem.pec_id ? `PEC-${selectedItem.pec_id}` : 'N/A')}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Bodega de Destino</p>
                  <p className="font-bold text-sm text-slate-800 mt-0.5">{selectedItem.warehouse_name || 'Bodega Principal Barranquilla'}</p>
                </div>
              </div>

              {/* Guía Visual de Separación */}
              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4">
                <h4 className="text-xs font-black text-teal-800 uppercase flex items-center gap-1.5 mb-2">
                  <Info size={14}/> Reglas de Distribución de Mercancía
                </h4>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-white p-2.5 rounded-xl border border-teal-100">
                    <span className="font-black text-emerald-700 block mb-0.5">Destino: Cliente</span>
                    <span className="text-slate-500">Pasa a cola de despacho. Se retiene entrega hasta cobrar 40% saldo.</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-teal-100">
                    <span className="font-black text-blue-700 block mb-0.5">Destino: Stock</span>
                    <span className="text-slate-500">Ingresa a stock disponible para venta inmediata en catálogo y web.</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-teal-100">
                    <span className="font-black text-purple-700 block mb-0.5">Destino: Mau</span>
                    <span className="text-slate-500">Separado en casillero de socio para custodia o entrega especial.</span>
                  </div>
                </div>
              </div>

              {/* Tabla de Productos de la Recepción */}
              <section>
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Líneas de la Recepción</h3>
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase">
                      <tr>
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3 text-center">Destino</th>
                        <th className="px-4 py-3 text-center">Esperado</th>
                        <th className="px-4 py-3 text-center">Recibido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedItem.lineas || selectedItem.productos || [
                        { nombre: 'Producto General', descripcion: selectedItem.notas || 'Lote general recibido', destino: 'CLIENTE', qty: 1, cantidad_recibida: 1 }
                      ]).map((linea: any, idx: number) => {
                        const destino = (linea.destino || 'CLIENTE').toUpperCase();
                        return (
                          <tr key={idx} className="hover:bg-slate-50/60">
                            <td className="px-4 py-3">
                              <p className="font-bold text-slate-800">{linea.product_name || linea.nombre || linea.descripcion || 'Ítem de Compra'}</p>
                              {linea.sku && <p className="text-[10px] text-slate-400 font-mono">{linea.sku}</p>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                                destino === 'MAU'
                                  ? 'bg-purple-100 text-purple-700'
                                  : destino === 'NEBULAE' || destino === 'STOCK'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {destino === 'MAU' ? 'Socio Mau' : destino === 'NEBULAE' || destino === 'STOCK' ? 'Stock Nebulae' : 'Cliente'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-slate-700">
                              {linea.quantity_expected || linea.qty || linea.cantidad || 1}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded-lg">
                                {linea.quantity_received || linea.qty || 1}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* Drawer Footer */}
            <div className="p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <button
                onClick={() => setDrawerOpen(false)}
                className="px-5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-100"
              >
                Cerrar
              </button>
              {(selectedItem.estado === 'PENDIENTE' || !selectedItem.stock_actualizado) && (
                <button
                  onClick={() => handleConfirmarRecepcion(selectedItem.id)}
                  disabled={confirming}
                  className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {confirming ? <RefreshCw size={14} className="animate-spin"/> : <Check size={14}/>}
                  Confirmar Entrada Física y Actualizar Stock
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
