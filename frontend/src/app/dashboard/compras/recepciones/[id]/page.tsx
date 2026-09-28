"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Save, FileText,
  Box, PackageCheck, AlertTriangle, MessageSquareWarning, ShieldCheck, Link as LinkIcon,
  RefreshCw, AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Badge, Button } from '@/components/ui';

const fDateLong = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

// GoodsReceipt.estado reales (ver _gr_dict / confirmar_recepcion en erp_compras.py):
// BORRADOR (recien creada, editable) -> COMPLETADA (FISICA, stock actualizado) /
// COMPLETADA_LOGISTICA (solo evento intermedio) -> ambas ya no editables.
// CANCELADA tambien existe (ver linea 1580). "Discrepancia" no es un estado real:
// se deriva localmente comparando qty_esperada vs qty_recibida mientras esta BORRADOR.
function estadoInfo(estado: string, hasDiscrepancy: boolean) {
  if (estado === 'COMPLETADA' || estado === 'COMPLETADA_LOGISTICA') {
    return { label: 'Validado (Facturable)', tone: 'success' as const, icon: ShieldCheck };
  }
  if (estado === 'CANCELADA') {
    return { label: 'Cancelada', tone: 'danger' as const, icon: undefined };
  }
  if (hasDiscrepancy) {
    return { label: 'Discrepancia', tone: 'warning' as const, icon: MessageSquareWarning };
  }
  return { label: 'Pendiente de Conteo', tone: 'neutral' as const, icon: undefined };
}

export default function RecepcionDetallePage() {
  const params = useParams();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [nota, setNota] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [savingWarehouse, setSavingWarehouse] = useState(false);

  useEffect(() => {
    apiFetch('/inventory/warehouses').then(d => setWarehouses(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
  }, []);

  useEffect(() => {
    setCurrentUser(localStorage.getItem('user_name') || localStorage.getItem('username') || '');
  }, []);

  const loadRecepcion = useCallback(async () => {
    if (!params.id) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const raw = await apiFetch(`/compras/recepciones/${params.id}`);
      const d = raw?.data ?? raw;
      setData(d);
      setItems((d?.productos || []).map((p: any) => ({
        grl_id: p.grl_id,
        sku_id: p.sku_id,
        nombre: p.nombre || p.product_name || p.descripcion || 'Item de Compra',
        qty_esperada: Number(p.qty_esperada ?? p.qty ?? 0),
        qty_recibida: Number(p.qty_recibida ?? 0),
      })));
    } catch (err: any) {
      setLoadError(err.message || 'No se pudo cargar la recepcion');
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadRecepcion(); }, [loadRecepcion]);

  // Resizable Right Pane Logic
  const [rightWidth, setRightWidth] = useState(400);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = rightWidth;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const delta = startX.current - e.clientX;
    const newWidth = Math.min(Math.max(300, startWidth.current + delta), 800);
    setRightWidth(newWidth);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const isEditable = data?.estado === 'BORRADOR';

  function updateReceived(idx: number, val: number) {
    if (!isEditable) return;
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, qty_recibida: val } : it)));
  }

  // Bodega Receptora used to be read-only, showing warehouse_name straight
  // from the backend — which falls back to the SUPPLIER's name when the PEC
  // never had a warehouse_id (nothing upstream lets you set one), so this was
  // the only place confirmar's "Debe seleccionar una bodega antes de
  // confirmar" could ever actually be resolved.
  async function updateWarehouse(warehouseId: string) {
    if (!data?.id || !warehouseId) return;
    setSavingWarehouse(true);
    try {
      await apiFetch(`/compras/recepciones/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ warehouse_id: Number(warehouseId) }),
      });
      await loadRecepcion();
    } catch (err: any) {
      alert('Error al asignar la bodega: ' + err.message);
    } finally {
      setSavingWarehouse(false);
    }
  }

  // Guarda el conteo actual de todas las lineas en un solo PATCH (batched-on-save).
  // Devuelve true si se guardo correctamente, para que confirmarRecepcion() sepa
  // si puede continuar.
  async function guardarConteo(): Promise<boolean> {
    if (!data?.id) return false;
    setSaving(true);
    try {
      await apiFetch(`/compras/recepciones/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          productos: items.map(i => ({ grl_id: i.grl_id, qty_recibida: Number(i.qty_recibida) || 0 })),
        }),
      });
      await loadRecepcion();
      return true;
    } catch (err: any) {
      alert('Error al guardar el conteo: ' + err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function validateConteo() {
    if (!data?.id) return;
    setConfirming(true);
    try {
      const saved = await guardarConteo();
      if (!saved) { setConfirming(false); return; }
      const allowExcess = items.some(i => Number(i.qty_recibida) > Number(i.qty_esperada));
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `rec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      await apiFetch(`/compras/recepciones/${data.id}/confirmar`, {
        method: 'POST',
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          receipt_type: 'FISICA',
          user_name: currentUser,
          notas: nota || undefined,
          allow_excess: allowExcess,
        }),
      });
      await loadRecepcion();
    } catch (err: any) {
      alert('Error al validar la recepcion: ' + err.message);
    }
    setConfirming(false);
  }

  const totalExpected = items.reduce((acc, i) => acc + (Number(i.qty_esperada) || 0), 0);
  const totalReceived = items.reduce((acc, i) => acc + (Number(i.qty_recibida) || 0), 0);
  const hasDiscrepancy = items.some(i => (Number(i.qty_recibida) || 0) !== (Number(i.qty_esperada) || 0));
  const estado = data?.estado || 'BORRADOR';
  const est = estadoInfo(estado, hasDiscrepancy);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <RefreshCw className="animate-spin text-emerald-600" size={28} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-white">
        <AlertCircle className="text-rose-500" size={32} />
        <p className="text-slate-600 font-medium">{loadError}</p>
        <Link href="/dashboard/compras/recepciones" className="text-emerald-600 font-bold text-sm hover:underline">
          Volver al listado de recepciones
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">

      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/compras/recepciones" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">
                {data?.numero || String(params.id).toUpperCase()}
              </h1>
              <Badge tone={est.tone} icon={est.icon}>{est.label}</Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isEditable ? (
            <>
              <Button variant="secondary" icon={Save} loading={saving} disabled={confirming} onClick={guardarConteo}>
                Guardar Borrador
              </Button>
              <Button color="teal" icon={PackageCheck} loading={confirming} disabled={saving} onClick={validateConteo}>
                Cerrar y Validar Conteo
              </Button>
            </>
          ) : (
            <span className="text-xs font-bold text-slate-400 px-3 py-2">Recepcion no editable en este estado</span>
          )}
        </div>
      </div>

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-row overflow-hidden">

        {/* BLOQUE 1: Informacion de Recepcion (Formulario Principal) */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white relative">

          {estado === 'BORRADOR' && hasDiscrepancy && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-8 flex items-center justify-between shadow-sm animate-in fade-in max-w-6xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-amber-600 shadow-sm"><AlertTriangle size={20}/></div>
                <div>
                  <h3 className="font-black text-amber-900">Alerta de Discrepancia en Conteo Fisico</h3>
                  <p className="text-sm text-amber-700">Las cantidades ingresadas no coinciden con la Orden de Compra. Finanzas bloqueara el pago hasta resolverse.</p>
                </div>
              </div>
            </div>
          )}

          {(estado === 'COMPLETADA' || estado === 'COMPLETADA_LOGISTICA') && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-8 flex items-center justify-between shadow-sm animate-in fade-in max-w-6xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm"><ShieldCheck size={20}/></div>
                <div>
                  <h3 className="font-black text-emerald-900">Mercancia Recibida Satisfactoriamente</h3>
                  <p className="text-sm text-emerald-700">
                    {data?.stock_actualizado
                      ? 'El stock ha sido ingresado al sistema. El Pedido de Compra (PEC) fue notificado.'
                      : 'Evento logistico registrado. Esta recepcion no actualizo stock disponible.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="max-w-6xl mx-auto space-y-10">

            {/* Cabecera del Documento Origen */}
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <FileText className="text-emerald-600" size={24} /> Documentos de Origen (Trazabilidad)
              </h2>

              <div className="grid grid-cols-4 gap-6 bg-slate-50 border border-slate-200 rounded-2xl p-6">

                {data?.pec_id && (
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Orden de Compra (Asociada)</label>
                    <Link href={`/dashboard/compras/pedidos/${data.pec_id}`} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-black hover:bg-emerald-100 transition-colors w-max shadow-sm">
                      <LinkIcon size={16} /> {data.pec_numero || `PEC-${data.pec_id}`}
                    </Link>
                  </div>
                )}

                {/* Nota: _gr_dict no expone ningun campo de Pedido de Venta (PVEN) asociado,
                    asi que esa tarjeta se omite en vez de inventar un enlace falso. */}

                <div className={data?.pec_id ? 'col-span-2' : 'col-span-4'}>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Proveedor</label>
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800">
                    {data?.supplier_name || 'Sin proveedor'}
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Bodega Receptora</label>
                  {isEditable ? (
                    <select
                      value={data?.warehouse_id || ''}
                      disabled={savingWarehouse}
                      onChange={e => updateWarehouse(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 disabled:opacity-50"
                    >
                      <option value="" disabled>{data?.warehouse_id ? (data.warehouse_name || 'Bodega desconocida') : 'Selecciona una bodega...'}</option>
                      {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800">
                      {data?.warehouse_name || 'Sin bodega asignada'}
                    </div>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Fecha de Recepcion</label>
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800">
                    {fDateLong(data?.fecha_recepcion || data?.created_at)}
                  </div>
                </div>

              </div>
            </div>

            {/* ARTÍCULOS - Conteo Físico */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  <Box className="text-emerald-600" size={24} /> Conteo Fisico / Validacion
                </h3>
                <div className="flex gap-4">
                  <div className="text-sm">
                    <span className="text-slate-500 font-bold mr-2">Esperado:</span>
                    <span className="bg-slate-100 text-slate-800 px-2 py-1 rounded font-black">{totalExpected} u.</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-slate-500 font-bold mr-2">Contado:</span>
                    <span className={`px-2 py-1 rounded font-black ${totalExpected !== totalReceived ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {totalReceived} u.
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm">
                <table className="w-full text-left whitespace-nowrap min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Producto (Referencia PEC)</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center bg-slate-100 border-x border-slate-200 w-32">Cant. Esperada</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center bg-emerald-50 border-r border-emerald-100 w-32">Cant. Recibida</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center w-24">Diferencia</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-48">Observaciones Fisicas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => {
                      const diff = (Number(item.qty_recibida) || 0) - (Number(item.qty_esperada) || 0);
                      const isError = diff !== 0;
                      return (
                        <tr key={item.grl_id ?? idx} className="hover:bg-slate-50">
                          <td className="px-4 py-4">
                            <div className="font-bold text-slate-800 text-sm">{item.nombre}</div>
                            {item.sku_id && <div className="text-slate-500 text-xs">SKU {item.sku_id}</div>}
                          </td>
                          <td className="px-4 py-4 text-center font-black text-slate-500 bg-slate-50 border-x border-slate-100">
                            {item.qty_esperada}
                          </td>
                          <td className="px-4 py-4 bg-emerald-50/30 border-r border-emerald-50">
                            <input
                              type="number"
                              min="0"
                              value={item.qty_recibida || ''}
                              disabled={!isEditable}
                              onChange={(e) => updateReceived(idx, parseInt(e.target.value) || 0)}
                              className={`w-full bg-white border rounded-lg px-2 py-2 text-center font-black outline-none transition-colors disabled:bg-slate-100 disabled:text-slate-400 ${
                                isError && item.qty_recibida !== 0 ? 'border-amber-400 focus:ring-1 focus:ring-amber-500 text-amber-700' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-emerald-700'
                              }`}
                            />
                          </td>
                          <td className="px-4 py-4 text-center font-black">
                            {item.qty_recibida === 0 ? (
                              <span className="text-slate-300">-</span>
                            ) : (
                              <span className={diff === 0 ? 'text-emerald-500' : 'text-amber-500 bg-amber-50 px-2 py-1 rounded'}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <input
                              type="text"
                              disabled={!isEditable}
                              placeholder="Ej: Cajas danadas..."
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:border-emerald-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400 italic">Sin lineas registradas en esta recepcion.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1.5 bg-slate-200 hover:bg-emerald-500 cursor-col-resize shrink-0 transition-colors z-30"
          title="Arrastrar para ajustar panel de firmas"
        />

        {/* BLOQUE 2: Firmas y Control Documental */}
        <div style={{ width: rightWidth }} className="bg-white flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">

          <div className="p-5 border-b border-slate-200 bg-slate-800 flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-white flex items-center gap-2 text-lg">
              <FileText className="text-slate-400" size={20} /> Inspeccion y Calidad
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50 space-y-6">

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Estado Visual de la Carga</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="estado_carga" className="text-emerald-600 focus:ring-emerald-500" defaultChecked disabled={!isEditable} />
                  <span className="text-sm font-bold text-slate-700">Optimo (Sin danos visibles)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="estado_carga" className="text-amber-600 focus:ring-amber-500" disabled={!isEditable} />
                  <span className="text-sm font-bold text-slate-700">Danos Menores (Empaques golpeados)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="estado_carga" className="text-rose-600 focus:ring-rose-500" disabled={!isEditable} />
                  <span className="text-sm font-bold text-slate-700">Critico (Mercancia expuesta/rota)</span>
                </label>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Notas de Recepcion</label>
              <textarea
                rows={4}
                value={nota}
                disabled={!isEditable}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Indique si el transportista dejo alguna novedad..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none disabled:bg-slate-100 disabled:text-slate-400"
              />
              <p className="text-[10px] text-slate-400 mt-2">Se envia como nota al confirmar la recepcion.</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Firma Responsable</label>
              <div className="h-24 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 font-medium">
                Area para firma digital del bodeguero
              </div>
              <p className="text-xs text-slate-400 text-center mt-2">
                {data?.confirmed_by ? `Confirmado por: ${data.confirmed_by}` : 'Aun sin confirmar'}
              </p>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
