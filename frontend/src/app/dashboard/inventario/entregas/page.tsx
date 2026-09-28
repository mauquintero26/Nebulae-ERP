'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowUpFromLine, Package, CheckCircle2, Clock,
  Search, RefreshCw, AlertCircle, Truck,
  DollarSign, ShieldAlert, MessageCircle
} from 'lucide-react';
import { apiFetch as _apiFetch, API_URL } from '@/lib/api';
import { SubNav, PageHeader, StatCard, Badge, Drawer, Button, Toast, ToastMsg } from '@/components/ui';
import { INV_NAV } from '../inv-nav';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error al procesar solicitud');
  return data.data ?? data;
}

const fCOP = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

// sale_orders no tiene columna saldo_pendiente_cop/pago_estado -- esos nombres
// nunca existieron en el backend, asi que el chequeo `!== undefined` de abajo
// caia siempre en el fallback. El campo real es saldo_cop (ya lo mantiene el
// backend, incluyendo casos de credito a favor del cliente: puede ser negativo
// a proposito, no se debe forzar a 0 aqui).
const anticipoDe = (v: any) => Number(v?.anticipo_cop || 0);
const saldoDe = (v: any) => v?.saldo_cop != null ? Number(v.saldo_cop) : Number(v?.total_cop || 0) - anticipoDe(v);

export default function EntregasPage() {
  const [ventas, setVentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Todos' | 'PendientesCobro' | 'ListosDespacho' | 'Despachados'>('Todos');
  const [selected, setSelected] = useState<any | null>(null);
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState<ToastMsg>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseId, setWarehouseId] = useState('');

  const showToast = (msg: string, type: 'ok' | 'error' = 'ok') => setToast({ msg, type });

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
    apiFetch('/inventory/warehouses').then(d => {
      const list = Array.isArray(d) ? d : (d?.data ?? []);
      setWarehouses(list);
      if (list.length === 1) setWarehouseId(String(list[0].id));
    }).catch(() => {});
  }, [loadData]);

  // Manejar el despacho seguro
  const handleDespachar = async (pedido: any, forzarConSaldo: boolean = false) => {
    const saldoPendiente = saldoDe(pedido);

    if (saldoPendiente > 0 && !forzarConSaldo) {
      const confirmacion = window.confirm(
        `¡ALERTA DE COBRO!

Este pedido tiene un saldo pendiente de ${fCOP(saldoPendiente)} (40%).

¿Estás seguro de autorizar la salida de bodega antes de verificar el pago?`
      );
      if (!confirmacion) return;
    }

    const tieneLineasDeCatalogo = (pedido.productos || []).some((p: any) => p.sku_id);
    if (tieneLineasDeCatalogo && !warehouseId) {
      showToast('Selecciona la bodega de despacho antes de continuar', 'error');
      return;
    }

    setUpdating(true);
    try {
      await apiFetch(`/ventas/pedidos/${pedido.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          estado: 'ENTREGADO',
          fecha_entrega: new Date().toISOString(),
          warehouse_id: warehouseId ? parseInt(warehouseId) : undefined,
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
          saldo_cop: 0,
          notas: pedido.notas ? `${pedido.notas} | Saldo 40% cobrado y verificado` : 'Saldo 40% verificado'
        })
      });

      showToast('Cobro de saldo registrado. Pedido listo para despacho.');
      setSelected((prev: any) => prev ? { ...prev, saldo_cop: 0 } : null);
      loadData();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Métricas
  const despachados = ventas.filter(v => v.estado === 'ENTREGADO' || v.estado === 'COMPLETADO').length;
  const enEspera = ventas.filter(v => v.estado !== 'ENTREGADO' && v.estado !== 'COMPLETADO' && v.estado !== 'CANCELADO');

  // Saldo retenido total (solo saldos positivos: un credito a favor del
  // cliente en un pedido no debe "restar" del total que falta por recaudar
  // de los demas)
  const saldoRetenidoTotal = enEspera.reduce((acc, v) => acc + Math.max(0, saldoDe(v)), 0);

  const filtered = ventas.filter(v => {
    const term = search.toLowerCase();
    const match = !search ||
      (v.numero || '').toLowerCase().includes(term) ||
      (v.customer_name || '').toLowerCase().includes(term) ||
      (v.cliente_telefono || '').toLowerCase().includes(term);

    if (!match) return false;

    const isDespachado = v.estado === 'ENTREGADO' || v.estado === 'COMPLETADO';
    const saldo = saldoDe(v);

    if (activeTab === 'PendientesCobro') return !isDespachado && saldo > 0;
    if (activeTab === 'ListosDespacho') return !isDespachado && saldo === 0;
    if (activeTab === 'Despachados') return isDespachado;

    return true;
  });

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in flex flex-col">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/entregas" color="rose" />

      <div className="p-8 max-w-[1600px] mx-auto space-y-6 flex-1 w-full">
        <PageHeader icon={ArrowUpFromLine} color="rose"
          title="Cola de Despacho & Cobro de Saldo (40%)"
          subtitle="Control riguroso de salidas de bodega: ningún pedido sale sin verificación del saldo pendiente."
          actions={(
            <div className="flex items-center gap-2.5">
              <button onClick={loadData}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-xs shadow-sm transition-colors">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
              </button>
              <Link href="/dashboard/ventas/venta"
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-bold text-xs shadow-sm transition-colors">
                <Package size={14} /> Ver Pedidos de Venta
              </Link>
            </div>
          )} />

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Clock} color="amber" label="En Cola Salida" value={enEspera.length} hint="Pendientes de confirmación" />
          <StatCard icon={DollarSign} color="rose" label="Saldo por Recaudar" value={fCOP(saldoRetenidoTotal)} hint="40% pendiente de cobro" />
          <StatCard icon={CheckCircle2} color="emerald" label="Despachados" value={despachados} hint="Entregados satisfactoriamente" />
          <StatCard variant="gradient" color="rose" icon={ShieldAlert} label="Protocolo 60/40"
            value={<span className="text-sm font-bold leading-relaxed">Si la mercancía llegó a bodega y el cliente no ha pagado el saldo, contáctalo por WhatsApp antes de generar la guía nacional.</span>} />
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
                    const saldo = saldoDe(ven);
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
                          {saldo <= 0 ? (
                            <Badge tone="success" icon={CheckCircle2}>100% Pagado</Badge>
                          ) : (
                            <Badge tone="warning" icon={AlertCircle}>Cobro Pendiente</Badge>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          <Badge tone={isDespachado ? 'success' : 'neutral'}>{ven.estado || 'PENDIENTE_ENTREGA'}</Badge>
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
        <Drawer
          onClose={() => setSelected(null)}
          header={(
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-800">{selected.numero}</h2>
                <Badge tone={selected.estado === 'ENTREGADO' ? 'success' : 'warning'}>{selected.estado || 'EN COLA SALIDA'}</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Control de Despacho & Verificación Financiera</p>
            </div>
          )}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setSelected(null)}>Cerrar</Button>
              {selected.estado !== 'ENTREGADO' && selected.estado !== 'COMPLETADO' && (
                <Button color="rose" icon={Truck} loading={updating} onClick={() => handleDespachar(selected)}>
                  Autorizar Salida y Despachar Pedido
                </Button>
              )}
            </>
          )}
        >
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
            const anticipo = anticipoDe(selected);
            const saldo = saldoDe(selected);
            const tieneSaldo = saldo > 0;
            const tieneCredito = saldo < 0;

            return (
              <div className={`p-5 rounded-2xl border ${
                tieneSaldo
                  ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                  : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-wider">Estado Financiero del Pedido</span>
                  <Badge tone={tieneSaldo ? 'warning' : 'success'}>{tieneSaldo ? 'SALDO PENDIENTE' : '100% CANCELADO'}</Badge>
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

                {tieneCredito && (
                  <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 mt-1">
                    El cliente pago de mas: hay un credito a favor de <strong>{fCOP(Math.abs(saldo))}</strong> pendiente de coordinar (reembolso o abono a otro pedido).
                  </p>
                )}

                {tieneSaldo && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] text-amber-800 leading-tight">
                      El cliente debe cancelar el saldo antes del despacho.
                    </p>
                    <Button size="sm" color="emerald" loading={updating} onClick={() => handleRegistrarCobroSaldo(selected)}>
                      Marcar Saldo Cobrado
                    </Button>
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

          {/* Bodega de Despacho -- solo aplica si hay lineas vinculadas a catalogo (con sku_id) */}
          {(selected.productos || []).some((p: any) => p.sku_id) && selected.estado !== 'ENTREGADO' && selected.estado !== 'COMPLETADO' && (
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2.5">
                Bodega de Despacho
              </h4>
              <select
                value={warehouseId}
                onChange={e => setWarehouseId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-200"
              >
                <option value="">Seleccionar...</option>
                {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Este pedido tiene productos de catálogo: se descontará el stock real de la bodega elegida al despachar.</p>
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}
