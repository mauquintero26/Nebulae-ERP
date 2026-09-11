'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowUpFromLine, Activity, Package, CheckCircle2, Clock,
  Search, X, RefreshCw, AlertCircle, Truck, ChevronRight,
  DollarSign, ShieldAlert, MessageCircle, Phone, Check, ArrowRight
} from 'lucide-react';
import { apiFetch as _apiFetch, API_URL } from '@/lib/api';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error al procesar solicitud');
  return data.data ?? data;
}

const INV_NAV = [
  { name: 'Productos',       path: '/dashboard/inventario/productos' },
  { name: 'Stock y Catálogo', path: '/dashboard/inventario/stock' },
  { name: 'Recepciones',     path: '/dashboard/inventario/recepciones' },
  { name: 'Entregas',        path: '/dashboard/inventario/entregas' },
  { name: 'Traslados',       path: '/dashboard/inventario/traslados' },
  { name: 'Ajustes',         path: '/dashboard/inventario/ajustes' },
  { name: 'Abastecimiento',  path: '/dashboard/inventario/abastecimiento' },
  { name: 'Bodegas',         path: '/dashboard/inventario/bodegas' },
];

const fCOP = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);
const fDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export default function EntregasPage() {
  const [ventas, setVentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Todos' | 'PendientesCobro' | 'ListosDespacho' | 'Despachados'>('Todos');
  const [selected, setSelected] = useState<any | null>(null);
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'ok' | 'error' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/ventas/pedidos?limit=200').catch(() => []);
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      setVentas(list);
    } catch {
      setVentas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Manejar el despacho seguro
  const handleDespachar = async (pedido: any, forzarConSaldo: boolean = false) => {
    const total = Number(pedido.total_cop || 0);
    const anticipo = Number(pedido.anticipo_cop || (total * 0.6));
    const saldoPendiente = pedido.saldo_pendiente_cop !== undefined 
      ? Number(pedido.saldo_pendiente_cop) 
      : Math.max(0, total - anticipo);

    if (saldoPendiente > 0 && !forzarConSaldo) {
      const confirmacion = window.confirm(
        `¡ALERTA DE COBRO!

Este pedido tiene un saldo pendiente de ${fCOP(saldoPendiente)} (40%).

¿Estás seguro de autorizar la salida de bodega antes de verificar el pago?`
      );
      if (!confirmacion) return;
    }

    setUpdating(true);
    try {
      await apiFetch(`/ventas/pedidos/${pedido.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          estado: 'ENTREGADO',
          fecha_entrega: new Date().toISOString(),
          notas: pedido.notas ? `${pedido.notas} | Despachado el ${new Date().toLocaleDateString()}` : 'Despachado desde mesa de entregas'
        })
      });

      showToast('Pedido despachado exitosamente');
      setSelected((prev: any) => prev ? { ...prev, estado: 'ENTREGADO' } : null);
      loadData();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Registrar cobro de saldo
  const handleRegistrarCobroSaldo = async (pedido: any) => {
    setUpdating(true);
    try {
      await apiFetch(`/ventas/pedidos/${pedido.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          saldo_pendiente_cop: 0,
          pago_estado: 'PAGADO_TOTAL',
          notas: pedido.notas ? `${pedido.notas} | Saldo 40% cobrado y verificado` : 'Saldo 40% verificado'
        })
      });

      showToast('Cobro de saldo registrado. Pedido listo para despacho.');
      setSelected((prev: any) => prev ? { ...prev, saldo_pendiente_cop: 0, pago_estado: 'PAGADO_TOTAL' } : null);
      loadData();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Métricas
  const totalPedidos = ventas.length;
  const despachados = ventas.filter(v => v.estado === 'ENTREGADO' || v.estado === 'COMPLETADO').length;
  const enEspera = ventas.filter(v => v.estado !== 'ENTREGADO' && v.estado !== 'COMPLETADO' && v.estado !== 'CANCELADO');
  
  // Saldo retenido total
  const saldoRetenidoTotal = enEspera.reduce((acc, v) => {
    const total = Number(v.total_cop || 0);
    const anticipo = Number(v.anticipo_cop || (total * 0.6));
    const saldo = v.saldo_pendiente_cop !== undefined ? Number(v.saldo_pendiente_cop) : Math.max(0, total - anticipo);
    return acc + saldo;
  }, 0);

  const filtered = ventas.filter(v => {
    const term = search.toLowerCase();
    const match = !search ||
      (v.numero || '').toLowerCase().includes(term) ||
      (v.customer_name || '').toLowerCase().includes(term) ||
      (v.cliente_telefono || '').toLowerCase().includes(term);

    if (!match) return false;

    const isDespachado = v.estado === 'ENTREGADO' || v.estado === 'COMPLETADO';
    const total = Number(v.total_cop || 0);
    const anticipo = Number(v.anticipo_cop || (total * 0.6));
    const saldo = v.saldo_pendiente_cop !== undefined ? Number(v.saldo_pendiente_cop) : Math.max(0, total - anticipo);

    if (activeTab === 'PendientesCobro') return !isDespachado && saldo > 0;
    if (activeTab === 'ListosDespacho') return !isDespachado && saldo === 0;
    if (activeTab === 'Despachados') return isDespachado;

    return true;
  });

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in flex flex-col">
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
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-3 shrink-0">Inventario:</span>
        {INV_NAV.map(mod => (
          <Link key={mod.name} href={mod.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ${
              mod.path === '/dashboard/inventario/entregas'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'text-slate-600 hover:bg-rose-50 hover:text-rose-700 border-transparent hover:border-rose-200'
            }`}>{mod.name}
          </Link>
        ))}
      </div>

      <div className="p-8 max-w-[1600px] mx-auto space-y-6 flex-1 w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="p-2.5 bg-rose-600 text-white rounded-2xl shadow-md shadow-rose-200">
                <ArrowUpFromLine size={22} />
              </div>
              Cola de Despacho & Cobro de Saldo (40%)
            </h1>
            <p className="text-slate-500 text-xs mt-1 font-medium">
              Control riguroso de salidas de bodega: <strong>ningún pedido sale sin verificación del saldo pendiente</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-xs shadow-sm transition-colors"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
            <Link
              href="/dashboard/ventas/venta"
              className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-bold text-xs shadow-sm transition-colors"
            >
              <Package size={14} /> Ver Pedidos de Venta
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-xs font-bold uppercase">En Cola Salida</span>
              <Clock size={16} className="text-amber-500" />
            </div>
            <h3 className="text-3xl font-black text-slate-800">{enEspera.length}</h3>
            <p className="text-[11px] text-amber-600 mt-1 font-medium">Pendientes de confirmación</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-xs font-bold uppercase">Saldo por Recaudar</span>
              <DollarSign size={16} className="text-rose-500" />
            </div>
            <h3 className="text-2xl font-black text-rose-600">{fCOP(saldoRetenidoTotal)}</h3>
            <p className="text-[11px] text-rose-600 mt-1 font-medium">40% pendiente de cobro</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-xs font-bold uppercase">Despachados</span>
              <CheckCircle2 size={16} className="text-emerald-500" />
            </div>
            <h3 className="text-3xl font-black text-emerald-600">{despachados}</h3>
            <p className="text-[11px] text-emerald-600 mt-1 font-medium">Entregados satisfactoriamente</p>
          </div>

          <div className="bg-gradient-to-br from-rose-600 to-red-700 p-5 rounded-2xl text-white shadow-md">
            <div className="flex items-center justify-between text-rose-100 mb-1.5">
              <span className="text-xs font-bold uppercase">Protocolo 60/40</span>
              <ShieldAlert size={16} />
            </div>
            <p className="text-xs leading-relaxed opacity-95">
              Si la mercancía llegó a bodega y el cliente no ha pagado el saldo, contáctalo por WhatsApp antes de generar la guía nacional.
            </p>
          </div>
        </div>

        {/* Tabla y Filtros */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/60 p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="flex gap-1.5 flex-wrap">
              {(['Todos', 'PendientesCobro', 'ListosDespacho', 'Despachados'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    activeTab === tab
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  {tab === 'Todos' ? 'Todos' : tab === 'PendientesCobro' ? 'Pendientes Saldo (40%)' : tab === 'ListosDespacho' ? 'Liberados (100% Pagos)' : 'Despachados'}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-72">
              <Search className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" size={15} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar PVEN, cliente o teléfono..."
                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-400 w-full"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Pedido (PVEN)</th>
                  <th className="px-6 py-3.5">Cliente</th>
                  <th className="px-6 py-3.5 text-center">Ítems</th>
                  <th className="px-6 py-3.5 text-right">Total Pedido</th>
                  <th className="px-6 py-3.5 text-right bg-rose-50/30 text-rose-800">Saldo Pendiente (40%)</th>
                  <th className="px-6 py-3.5 text-center">Semáforo Cobro</th>
                  <th className="px-6 py-3.5 text-center">Estado Salida</th>
                  <th className="px-6 py-3.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                      <RefreshCw size={24} className="animate-spin text-rose-500 mx-auto mb-2" />
                      Cargando cola de entregas...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                      <ArrowUpFromLine size={36} className="mx-auto mb-2 opacity-30" />
                      No hay pedidos en este estado de entrega
                    </td>
                  </tr>
                ) : (
                  filtered.map((ven: any) => {
                    const total = Number(ven.total_cop || 0);
                    const anticipo = Number(ven.anticipo_cop || (total * 0.6));
                    const saldo = ven.saldo_pendiente_cop !== undefined ? Number(ven.saldo_pendiente_cop) : Math.max(0, total - anticipo);
                    const isDespachado = ven.estado === 'ENTREGADO' || ven.estado === 'COMPLETADO';
                    const tel = (ven.cliente_telefono || ven.customer_phone || '').replace(/[^0-9]/g, '');

                    return (
                      <tr
                        key={ven.id}
                        onClick={() => setSelected(ven)}
                        className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                      >
                        <td className="px-6 py-3.5">
                          <p className="font-black text-rose-700">{ven.numero}</p>
                          {ven.cot_numero && <p className="text-[10px] text-slate-400 mt-0.5">de {ven.cot_numero}</p>}
                        </td>
                        <td className="px-6 py-3.5">
                          <p className="font-bold text-slate-800">{ven.customer_name || ven.cliente_nombre || 'Cliente Sin Nombre'}</p>
                          {tel && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{tel}</p>}
                        </td>
                        <td className="px-6 py-3.5 text-center font-semibold text-slate-700">
                          {(ven.productos || []).length || 1}
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-slate-800">
                          {fCOP(total)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-black bg-rose-50/20">
                          <span className={saldo > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            {fCOP(saldo)}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          {saldo === 0 || ven.pago_estado === 'PAGADO_TOTAL' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              <CheckCircle2 size={11} /> 100% Pagado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              <AlertCircle size={11} /> Cobro Pendiente
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                            isDespachado
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {ven.estado || 'PENDIENTE_ENTREGA'}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                            {tel && saldo > 0 && (
                              <a
                                href={`https://wa.me/57${tel}?text=${encodeURIComponent(`Hola ${ven.customer_name || ''}! Tu pedido ${ven.numero} ya llegó a bodega Nebulae 🎉. Para proceder con el despacho nacional, puedes cancelar el saldo restante de ${fCOP(saldo)}.`)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors"
                                title="Enviar recordatorio WhatsApp"
                              >
                                <MessageCircle size={14} />
                              </a>
                            )}
                            <button
                              onClick={() => setSelected(ven)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                            >
                              Ver
                            </button>
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
      </div>

      {/* DRAWER LATERAL DE DESPACHO Y COBRO */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col">
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-slate-800">{selected.numero}</h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    selected.estado === 'ENTREGADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {selected.estado || 'EN COLA SALIDA'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Control de Despacho & Verificación Financiera</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Tarjeta de Datos Cliente */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-slate-800 text-sm">{selected.customer_name || selected.cliente_nombre || 'Cliente Nebulae'}</h4>
                    <p className="text-xs text-slate-500">{selected.cliente_telefono || selected.customer_phone || 'Sin teléfono registrado'}</p>
                  </div>
                  {selected.cliente_telefono && (
                    <a
                      href={`https://wa.me/57${selected.cliente_telefono.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-200 transition-colors"
                    >
                      <MessageCircle size={16} />
                    </a>
                  )}
                </div>
                <p className="text-xs text-slate-500 pt-1 border-t border-slate-200/60">
                  Dirección: <strong>{selected.direccion_envio || selected.shipping_address || 'Pendiente por confirmar'}</strong>
                </p>
              </div>

              {/* Semáforo Financiero 60/40 */}
              {(() => {
                const total = Number(selected.total_cop || 0);
                const anticipo = Number(selected.anticipo_cop || (total * 0.6));
                const saldo = selected.saldo_pendiente_cop !== undefined ? Number(selected.saldo_pendiente_cop) : Math.max(0, total - anticipo);
                const tieneSaldo = saldo > 0;

                return (
                  <div className={`p-5 rounded-2xl border ${
                    tieneSaldo
                      ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                      : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-black uppercase tracking-wider">Estado Financiero del Pedido</span>
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                        tieneSaldo ? 'bg-amber-200 text-amber-800' : 'bg-emerald-200 text-emerald-800'
                      }`}>
                        {tieneSaldo ? 'SALDO PENDIENTE' : '100% CANCELADO'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center py-2 border-y border-amber-200/50 my-2">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Total</p>
                        <p className="font-bold text-xs mt-0.5 text-slate-800">{fCOP(total)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Anticipo (60%)</p>
                        <p className="font-bold text-xs mt-0.5 text-emerald-700">{fCOP(anticipo)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Saldo (40%)</p>
                        <p className={`font-black text-xs mt-0.5 ${tieneSaldo ? 'text-rose-600' : 'text-emerald-700'}`}>{fCOP(saldo)}</p>
                      </div>
                    </div>

                    {tieneSaldo && (
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-[11px] text-amber-800 leading-tight">
                          El cliente debe cancelar el saldo antes del despacho.
                        </p>
                        <button
                          onClick={() => handleRegistrarCobroSaldo(selected)}
                          disabled={updating}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm shrink-0"
                        >
                          Marcar Saldo Cobrado
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Lista de Productos */}
              <div>
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2.5">
                  Productos a Despachar
                </h4>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Producto</th>
                        <th className="px-4 py-2.5 text-center">Cant.</th>
                        <th className="px-4 py-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selected.productos || [
                        { product_name: 'Producto General', qty: 1, unit_price_cop: selected.total_cop }
                      ]).map((p: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2.5 font-medium text-slate-800">{p.product_name || p.nombre || 'Item'}</td>
                          <td className="px-4 py-2.5 text-center font-bold">{p.qty || p.cantidad || 1}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-700">
                            {fCOP(Number(p.qty || 1) * Number(p.unit_price_cop || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <button
                onClick={() => setSelected(null)}
                className="px-5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-100"
              >
                Cerrar
              </button>

              {selected.estado !== 'ENTREGADO' && selected.estado !== 'COMPLETADO' && (
                <button
                  onClick={() => handleDespachar(selected)}
                  disabled={updating}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {updating ? <RefreshCw size={14} className="animate-spin" /> : <Truck size={14} />}
                  Autorizar Salida y Despachar Pedido
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
