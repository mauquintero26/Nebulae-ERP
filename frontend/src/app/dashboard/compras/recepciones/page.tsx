'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  PackageCheck, Activity, Search, RefreshCw,
  CheckCircle2, Clock, Truck, ShieldCheck,
  Plus, Info, Check
} from 'lucide-react';
import { apiFetch as _apiFetch } from '@/lib/api';
import { SubNav, PageHeader, StatCard, Badge, Modal, Drawer, Toast, Button, EmptyState } from '@/components/ui';
import { COMP_NAV } from '../comp-nav';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error al procesar solicitud');
  return data.data ?? data;
}

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
      // Filtrar PECs que esten en camino o listos para recepcion fisica.
      // Los valores reales de PurchaseOrderFull.estado son EN_TRANSITO (tracking
      // en curso) y RECIBIDO/RECIBIDA (todas las etapas de tracking completadas
      // -- ver update_tracking en erp_compras.py). Antes esta lista solo tenia
      // nombres que erp_compras.py nunca produce, asi que un PEC que terminaba
      // su tracking (RECIBIDO) desaparecia de este picker en vez de aparecer.
      setPecsEnTransito(pecList.filter((p: any) =>
        ['EN_TRANSITO', 'RECIBIDO', 'RECIBIDA'].includes(p.estado)
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
      <Toast toast={toast} onClose={() => setToast(null)} />

      <SubNav label="Hub de Compras" items={COMP_NAV} currentPath="/dashboard/compras/recepciones" color="teal" hub={{ href: '/dashboard/compras' }} />

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
          <Button size="sm" color="teal" onClick={() => setShowPecModal(true)}>
            + Nueva Entrada desde PEC
          </Button>
        </div>
      )}

      {/* Titulo y Acciones */}
      <div className="px-6 mt-6">
        <PageHeader
          icon={PackageCheck} color="teal"
          title="Mesa de Recepciones Físico-Digital"
          subtitle="Inspección física y separación por destino: Cliente (despacho), Stock Nebulae (disponible) y Socio Mau."
          actions={(
            <div className="flex gap-2.5">
              <Button size="sm" color="teal" icon={Plus} onClick={() => setShowPecModal(true)}>
                Recepcionar PEC
              </Button>
              <button
                onClick={loadData}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-xs font-bold shadow-sm transition-colors"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
              </button>
            </div>
          )}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 px-6 mt-6">
        <StatCard icon={Clock} color="amber" label="Pendientes Mesa" value={pendientesCount} hint="Por confirmar entrada física" />
        <StatCard icon={CheckCircle2} color="emerald" label="Confirmadas" value={completadasCount} hint="Stock ingresado al ERP" />
        <StatCard icon={Truck} color="blue" label="PECs en Tránsito" value={pecsEnTransito.length} hint="En camino o aduana" />
        <StatCard variant="gradient" color="teal" icon={ShieldCheck} label="Regla de Separación"
          value={<span className="text-sm font-bold leading-relaxed">Los ítems de <strong>Cliente</strong> no se mezclan con stock libre; van directamente a la cola de despacho y saldo del 40%.</span>} />
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
                  <td colSpan={9}>
                    <EmptyState icon={PackageCheck} message="No se encontraron recepciones en este filtro" hint='Usa "+ Recepcionar PEC" para iniciar la entrada física de un pedido.' />
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
                        <Badge tone={isPending ? 'warning' : 'success'}>
                          {row.estado || (isPending ? 'PENDIENTE' : 'COMPLETADA')}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {row.stock_actualizado ? (
                          <Badge tone="success" icon={CheckCircle2}>Sí</Badge>
                        ) : (
                          <Badge tone="neutral">Pendiente</Badge>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => { setSelectedItem(row); setDrawerOpen(true); }}>
                            Inspeccionar
                          </Button>
                          {isPending && (
                            <Button size="sm" color="teal" loading={confirming} onClick={() => handleConfirmarRecepcion(row.id)}>
                              Confirmar
                            </Button>
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
        <Modal
          title="Iniciar Entrada desde Pedido de Compra"
          subtitle="Selecciona el embarque que acaba de llegar físicamente a la mesa de bodega"
          color="teal"
          maxWidth="xl"
          onClose={() => setShowPecModal(false)}
          footer={<Button variant="secondary" onClick={() => setShowPecModal(false)}>Cancelar</Button>}
        >
          {pecsEnTransito.length === 0 ? (
            <EmptyState icon={Truck} message="No hay pedidos de compra activos para recepcionar." />
          ) : (
            <div className="space-y-3">
              {pecsEnTransito.map((pec: any) => (
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
                  <Button size="sm" color="teal" icon={PackageCheck} loading={creatingFromPec === pec.id} onClick={() => handleCrearDesdePec(pec.id)}>
                    Recepcionar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* DRAWER DETALLE DE RECEPCION Y SEPARACION POR DESTINO */}
      {isDrawerOpen && selectedItem && (
        <Drawer
          onClose={() => setDrawerOpen(false)}
          header={(
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-black text-slate-800">{selectedItem.numero || `ENINV-${selectedItem.id}`}</h2>
                <Badge tone={selectedItem.estado === 'COMPLETADA' || selectedItem.stock_actualizado ? 'success' : 'warning'}>
                  {selectedItem.estado || 'PENDIENTE'}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspección Física y Clasificación de Líneas en Mesa de Entrada
              </p>
            </div>
          )}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Cerrar</Button>
              {(selectedItem.estado === 'PENDIENTE' || !selectedItem.stock_actualizado) && (
                <Button color="teal" icon={Check} loading={confirming} onClick={() => handleConfirmarRecepcion(selectedItem.id)}>
                  Confirmar Entrada Física y Actualizar Stock
                </Button>
              )}
            </>
          )}
        >
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
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
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
                          <Badge tone={destino === 'MAU' ? 'purple' : (destino === 'NEBULAE' || destino === 'STOCK') ? 'info' : 'success'}>
                            {destino === 'MAU' ? 'Socio Mau' : destino === 'NEBULAE' || destino === 'STOCK' ? 'Stock Nebulae' : 'Cliente'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-700">
                          {linea.qty_esperada ?? linea.quantity_expected ?? linea.qty ?? linea.cantidad ?? 1}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded-lg">
                            {linea.qty_recibida ?? linea.quantity_received ?? 0}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </Drawer>
      )}
    </div>
  );
}
