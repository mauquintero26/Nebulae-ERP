"use client";

import { createContext, useContext, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft, Save, FileText,
  Box, PackageCheck, AlertTriangle, MessageSquareWarning, ShieldCheck, Link as LinkIcon,
  RefreshCw, AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FOCO_DENTRO, RESERVA_BOTON_IA } from '@/lib/design-system';
import { apiFetch } from '@/lib/api';
import { Badge, Button, useAvisos } from '@/components/ui';
// B4 T16A (TABLA-compras punto 12): la tabla del conteo en la tabla estándar, modo simple (se estira, se mueve y se recuerda;
// sin paginación, orden ni selección), con los campos de conteo editables. Los diálogos nativos pasaron a useAvisos (RP30).
import { TablaEstandar, usePreferenciasTabla } from '@/components/tabla';
import type { ColumnaTabla } from '@/components/tabla';
import { fechaLarga } from '@/lib/fechas-colombia';
import { recargarTrasError } from '@/lib/avisos';
import { esConteoHeredado, guardarConteoEnSerie, leerCantidadConteo, peticionesConteo, recargaReponeLineas, textoFalloConteo } from '@/lib/estados-compras';
// B4 T24 f3 (FINAL-C4-f, ruling 5): BODEGA cuenta con el PATCH por línea y confirma; COMPRAS ve el conteo en solo lectura; ADMIN ve todo.
import { accesoRecepciones, accionesConteo } from '@/lib/roles';
import { useRolActual } from '@/components/ui/useRolActual';

// Un instante del API (la fecha de recepción) en el día de Colombia; lo vacío, '-'.
const fDateLong = (iso: unknown) => fechaLarga(iso) || '-';

/** Una línea del conteo: lo que pide la recepción y lo que se cuenta; `idx` es su posición (la clave si no trae grl_id). */
type LineaConteo = { idx: number; grl_id?: number; sku_id?: number | string | null; nombre: string; qty_esperada: number; qty_recibida: number;
  /** B4.1 T7 (P20): las observaciones físicas de la línea (null: sin ellas; una recepción vieja no trae la clave). */
  observaciones?: string | null };
/** Lo que las celdas editables le piden a la página (por un contexto, para que las columnas sean una constante, D40 y D41). */
type ControlConteo = {
  editable: boolean; heredada: boolean; actualizar: (idx: number, valor: number) => void;
  actualizarObservaciones: (idx: number, texto: string) => void;
};
const ConteoContext = createContext<ControlConteo | null>(null);
// B4 T24 r1 (C5): los campos van dentro de la celda (un span truncado): el foco, hacia adentro (FOCO_DENTRO).

/** Cant. Recibida: el campo de conteo (editable solo con la recepción en BORRADOR). */
function CeldaRecibida({ l }: { l: LineaConteo }) {
  const control = useContext(ConteoContext);
  const hayDiferencia = l.qty_recibida !== l.qty_esperada;
  return (
    <input
      type="number"
      min="0"
      value={l.qty_recibida || ''}
      disabled={!control?.editable}
      aria-label={`Cantidad recibida de ${l.nombre}`}
      onChange={(e) => control?.actualizar(l.idx, leerCantidadConteo(e.target.value))}
      className={`w-full bg-white border rounded-lg px-2 py-2 text-center font-black transition-colors disabled:bg-slate-100 disabled:text-slate-500 ${FOCO_DENTRO} ${
        hayDiferencia && l.qty_recibida !== 0 ? 'border-amber-400 text-amber-800' : 'border-slate-300 focus:border-emerald-500 text-emerald-700'
      }`}
    />
  );
}

/** Diferencia: recibida menos esperada (con signo); sin nada contado, un guion. */
function CeldaDiferencia({ l }: { l: LineaConteo }) {
  if (l.qty_recibida === 0) return <span className="font-black text-slate-400">-</span>;
  const diff = l.qty_recibida - l.qty_esperada;
  return <span className={`font-black ${diff === 0 ? 'text-emerald-700' : 'text-amber-800 bg-amber-50 px-2 py-1 rounded'}`}>{diff > 0 ? `+${diff}` : diff}</span>;
}

/** Observaciones físicas (B4.1 P20): el campo es de la línea y se guarda con el PATCH por línea (`notes`, hasta 500) al guardar el conteo. */
function CeldaObservaciones({ l }: { l: LineaConteo }) {
  const control = useContext(ConteoContext);
  return (
    <input
      type="text"
      value={l.observaciones ?? ''}
      onChange={(e) => control?.actualizarObservaciones(l.idx, e.target.value)}
      maxLength={500}
      disabled={!control?.editable || control.heredada}
      title={control?.heredada ? 'Esta recepción heredada no guarda observaciones por línea.' : undefined}
      placeholder="Ej: Cajas dañadas..."
      aria-label={`Observaciones físicas de ${l.nombre}`}
      className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 ${FOCO_DENTRO}`}
    />
  );
}

/**
 * B4 T16A, la tabla del conteo (TABLA-compras punto 12; D40, D41): Producto (la flexible), Cant. Esperada, Cant. Recibida
 * (editable), Diferencia y Observaciones. Una constante (estable): las celdas editables leen la página por ConteoContext.
 */
const COLUMNAS_CONTEO: ColumnaTabla<LineaConteo>[] = [
  { id: 'producto', titulo: 'Producto (Referencia PEC)', ancho: 130, flexible: true, anchoMax: 960, clave: true, titleCelda: (l) => l.nombre,
    celda: (l) => (
      <span className="block leading-tight">
        <span className="block truncate text-sm font-bold text-slate-800">{l.nombre}</span>
        {l.sku_id && <span className="block truncate text-xs text-slate-500">SKU {l.sku_id}</span>}
      </span>
    ) },
  { id: 'esperada', titulo: 'Cant. Esperada', ancho: 88, alinear: 'centro', celda: (l) => <span className="font-black text-slate-600">{l.qty_esperada}</span> },
  { id: 'recibida', titulo: 'Cant. Recibida', ancho: 100, alinear: 'centro', clave: true, celda: (l) => <CeldaRecibida l={l} /> },
  { id: 'diferencia', titulo: 'Diferencia', ancho: 84, alinear: 'centro', celda: (l) => <CeldaDiferencia l={l} /> },
  { id: 'observaciones', titulo: 'Observaciones Físicas', ancho: 120, celda: (l) => <CeldaObservaciones l={l} /> },
];

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
  const { avisar, avisarError } = useAvisos();
  const rol = useRolActual();
  // TABLA-compras punto 12 (D40): un solo usePreferenciasTabla para la tabla del conteo.
  const prefsConteo = usePreferenciasTabla('compras.recepcion.conteo', COLUMNAS_CONTEO);

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
    apiFetch('/inventory/warehouses').then(d => setWarehouses(Array.isArray(d) ? d : (d?.data ?? [])))
      // Nada se traga: sin la lista no se puede asignar la bodega, y el aviso lo dice con el mensaje del servidor.
      .catch((err: unknown) => avisarError(err, 'No se pudieron cargar las bodegas'));
  }, [avisarError]);

  useEffect(() => {
    setCurrentUser(localStorage.getItem('user_name') || localStorage.getItem('username') || '');
  }, []);

  // B4 T24 r1 (m15): la recarga silenciosa (tras guardar el conteo o tras un error que pide recargar, también un 422) no muestra el spinner
  // de página, que desmontaba el conteo y vaciaba las «Observaciones Físicas», ni vuelve a llenar las líneas mientras siga en BORRADOR.
  const loadRecepcion = useCallback(async ({ silencioso = false }: { silencioso?: boolean } = {}) => {
    if (!params.id) { setLoading(false); return; }
    if (!silencioso) { setLoading(true); setLoadError(''); }
    try {
      const raw = await apiFetch(`/compras/recepciones/${params.id}`);
      const d = raw?.data ?? raw;
      setData(d);
      if (recargaReponeLineas({ silencioso, recepcion: d })) {
        setItems((d?.productos || []).map((p: any) => ({
          grl_id: p.grl_id,
          sku_id: p.sku_id,
          nombre: p.nombre || p.product_name || p.descripcion || 'Ítem de Compra',
          qty_esperada: Number(p.qty_esperada ?? p.qty ?? 0),
          qty_recibida: Number(p.qty_recibida ?? 0),
          observaciones: p.observaciones ?? null,
        })));
      }
    } catch (err: any) {
      if (!silencioso) setLoadError(err.message || 'No se pudo cargar la recepción');
      else avisarError(err, 'No se pudo recargar la recepción');
    }
    if (!silencioso) setLoading(false);
  }, [params.id, avisarError]);

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
  // B4 T24 f3 (FINAL-C4-f): lo que ofrece el conteo según el rol (después de montar) y si la recepción es heredada (sin GRL).
  const heredada = esConteoHeredado(items);
  // r1 (C1): sin bodega receptora, BODEGA guarda el conteo pero no valida (no la puede elegir) y COMPRAS lee que la asigne.
  const conteo = accionesConteo({ porConfirmar: isEditable, heredada, sinBodega: !data?.warehouse_id, rol });
  const puedeBodega = isEditable && accesoRecepciones(rol).bodega;

  const updateReceived = useCallback((idx: number, val: number) => {
    if (!isEditable) return;
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, qty_recibida: val } : it)));
  }, [isEditable]);
  const updateObservaciones = useCallback((idx: number, texto: string) => {
    if (!isEditable) return;
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, observaciones: texto } : it)));
  }, [isEditable]);
  // La tabla del conteo (modo simple): las líneas con su posición y el control que leen las celdas editables.
  const lineas = useMemo<LineaConteo[]>(() => items.map((it, idx) => ({ ...it, idx })), [items]);
  const control = useMemo<ControlConteo>(() => ({
    editable: conteo.contar, heredada, actualizar: updateReceived, actualizarObservaciones: updateObservaciones,
  }), [conteo.contar, heredada, updateReceived, updateObservaciones]);

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
    } catch (err: unknown) {
      avisarError(err, 'Error al asignar la bodega');
    } finally {
      setSavingWarehouse(false);
    }
  }

  // B4 T24 f3 (FINAL-C4-f, ruling 5): el conteo se guarda con el PATCH por línea (/compras/recepciones/{id}/lineas/{grl_id}, que BODEGA
  // tiene), una petición por línea cambiada frente al servidor (peticionesConteo: la recibida, un entero, y rechazadas y cuarentena en 0,
  // como el lote). La lib valida antes cada cantidad (un entero de 0 a 99.999.999). Una heredada (sin GRL) solo la cuenta ADMIN, con el
  // PATCH en lote de siempre. Si una petición falla, se detiene, se avisa con el texto del servidor (también su 422) y, con la regla
  // única (recargarTrasError), se recarga en silencio. Devuelve true si se guardó, para que validateConteo siga.
  async function guardarConteo(): Promise<boolean> {
    if (!data?.id || !conteo.contar) return false;
    const { error, peticiones } = peticionesConteo(data.productos, items);
    if (error) { avisar(error, { tono: 'error' }); return false; }
    setSaving(true);
    try {
      if (heredada) {
        await apiFetch(`/compras/recepciones/${data.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ productos: items.map(i => ({ grl_id: i.grl_id, qty_recibida: Number(i.qty_recibida) || 0 })) }),
        });
      } else {
        // r1 (m22): en serie, en la lib (guardarConteoEnSerie): se detiene en la primera que falla; el aviso nombra esa línea y dice que
        // las anteriores ya quedaron guardadas; con la regla única (recargarTrasError), se recarga.
        const serie = await guardarConteoEnSerie(peticiones,
          (p) => apiFetch(`/compras/recepciones/${data.id}/lineas/${p.grl_id}`, { method: 'PATCH', body: JSON.stringify(p.cuerpo) }));
        if (serie.fallo) {
          const nombre = items.find((i) => i.grl_id === serie.fallo?.grl_id)?.nombre;
          avisarError(serie.fallo.error, textoFalloConteo(nombre, serie.guardadas));
          if (recargarTrasError(serie.fallo.error)) await loadRecepcion({ silencioso: true });
          return false;
        }
      }
      await loadRecepcion({ silencioso: true });
      return true;
    } catch (err: unknown) {
      avisarError(err, 'Error al guardar el conteo');
      if (recargarTrasError(err)) await loadRecepcion({ silencioso: true });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function validateConteo() {
    if (!data?.id || !conteo.validar) return;
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
    } catch (err: unknown) {
      avisarError(err, 'Error al validar la recepción');
      // Si la recepción cambió en otro lado (un 409 o un 422, F8: recargarTrasError), se vuelve a pedir en silencio lo que se muestra.
      if (recargarTrasError(err)) await loadRecepcion({ silencioso: true });
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
      <div className="bg-white px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 z-20 shadow-sm shrink-0">
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
          {conteo.contar && (
            <Button variant="secondary" icon={Save} loading={saving} disabled={confirming} onClick={guardarConteo}>
              Guardar Borrador
            </Button>
          )}
          {conteo.validar && (
            <Button color="teal" icon={PackageCheck} loading={confirming} disabled={saving} onClick={validateConteo}>
              Cerrar y Validar Conteo
            </Button>
          )}
          {conteo.texto && <span role="status" className="text-xs font-bold text-slate-500 px-3 py-2">{conteo.texto}</span>}
          {!isEditable && <span className="text-xs font-bold text-slate-400 px-3 py-2">Recepción no editable en este estado</span>}
        </div>
      </div>

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden">

        {/* BLOQUE 1: Información de Recepción (Formulario Principal) */}
        <div className="xl:flex-1 xl:overflow-y-auto px-4 sm:px-8 py-8 custom-scrollbar bg-white relative min-w-0">

          {estado === 'BORRADOR' && hasDiscrepancy && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-8 flex items-center justify-between shadow-sm animate-in fade-in max-w-6xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-amber-600 shadow-sm"><AlertTriangle size={20}/></div>
                <div>
                  <h3 className="font-black text-amber-900">Alerta de Discrepancia en Conteo Físico</h3>
                  <p className="text-sm text-amber-700">Las cantidades ingresadas no coinciden con la Orden de Compra. Finanzas bloqueará el pago hasta resolverse.</p>
                </div>
              </div>
            </div>
          )}

          {(estado === 'COMPLETADA' || estado === 'COMPLETADA_LOGISTICA') && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-8 flex items-center justify-between shadow-sm animate-in fade-in max-w-6xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm"><ShieldCheck size={20}/></div>
                <div>
                  <h3 className="font-black text-emerald-900">Mercancía Recibida Satisfactoriamente</h3>
                  <p className="text-sm text-emerald-700">
                    {data?.stock_actualizado
                      ? 'El stock ha sido ingresado al sistema. El Pedido de Compra (PEC) fue notificado.'
                      : 'Evento logístico registrado. Esta recepción no actualizó stock disponible.'}
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

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-6">

                {data?.pec_id && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Orden de Compra (Asociada)</label>
                    <Link href={`/dashboard/compras/pedidos/${data.pec_id}`} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-black hover:bg-emerald-100 transition-colors w-max shadow-sm">
                      <LinkIcon size={16} /> {data.pec_numero || `PEC-${data.pec_id}`}
                    </Link>
                  </div>
                )}

                {/* Nota: _gr_dict no expone ningun campo de Pedido de Venta (PVEN) asociado,
                    asi que esa tarjeta se omite en vez de inventar un enlace falso. */}

                <div className={data?.pec_id ? 'sm:col-span-2' : 'sm:col-span-4'}>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Proveedor</label>
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800">
                    {data?.supplier_name || 'Sin proveedor'}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Bodega Receptora</label>
                  {puedeBodega ? (
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

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Fecha de Recepción</label>
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
                  <Box className="text-emerald-600" size={24} /> Conteo Físico / Validación
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

              {/* B4 T16A (TABLA-compras punto 12): la tabla estándar en modo simple (se estira, se mueve y se recuerda; sin
                  paginación, orden ni selección). Los campos de conteo siguen editables (ConteoContext) con la recepción en
                  BORRADOR. */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <ConteoContext.Provider value={control}>
                  <TablaEstandar id="compras.recepcion.conteo" modo="simple" columnas={COLUMNAS_CONTEO} preferencias={prefsConteo}
                    filas={lineas} claveFila={(l) => l.grl_id ?? `linea-${l.idx}`}
                    vacio={<span className="italic">Sin líneas registradas en esta recepción.</span>} etiqueta="Conteo físico de la recepción" />
                </ConteoContext.Provider>
              </div>
            </div>

          </div>
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="hidden xl:block w-1.5 bg-slate-200 hover:bg-emerald-500 cursor-col-resize shrink-0 transition-colors z-30"
          title="Arrastrar para ajustar panel de firmas"
        />

        {/* BLOQUE 2: Firmas y Control Documental */}
        <div style={{ '--ancho-firmas': `${rightWidth}px` } as CSSProperties}
          className="bg-white flex flex-col xl:overflow-hidden shrink-0 w-full xl:w-[var(--ancho-firmas)] border-t border-slate-200 xl:border-t-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">

          <div className="p-5 border-b border-slate-200 bg-slate-800 flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-white flex items-center gap-2 text-lg">
              <FileText className="text-slate-400" size={20} /> Inspección y Calidad
            </h3>
          </div>

          <div className={`xl:flex-1 xl:overflow-y-auto px-4 pt-4 sm:px-6 sm:pt-6 ${RESERVA_BOTON_IA} custom-scrollbar bg-slate-50 space-y-6`}>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Estado Visual de la Carga</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="estado_carga" className="text-emerald-600 focus:ring-emerald-500" defaultChecked disabled={!conteo.contar} />
                  <span className="text-sm font-bold text-slate-700">Óptimo (Sin daños visibles)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="estado_carga" className="text-amber-600 focus:ring-amber-500" disabled={!conteo.contar} />
                  <span className="text-sm font-bold text-slate-700">Daños Menores (Empaques golpeados)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="estado_carga" className="text-rose-600 focus:ring-rose-500" disabled={!conteo.contar} />
                  <span className="text-sm font-bold text-slate-700">Crítico (Mercancía expuesta/rota)</span>
                </label>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Notas de Recepción</label>
              <textarea
                rows={4}
                value={nota}
                disabled={!conteo.validar}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Indique si el transportista dejó alguna novedad..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none disabled:bg-slate-100 disabled:text-slate-400"
              />
              <p className="text-[10px] text-slate-400 mt-2">Se envía como nota al confirmar la recepción.</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Firma Responsable</label>
              <div className="h-24 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 font-medium">
                Área para firma digital del bodeguero
              </div>
              <p className="text-xs text-slate-400 text-center mt-2">
                {data?.confirmed_by ? `Confirmado por: ${data.confirmed_by}` : 'Aún sin confirmar'}
              </p>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
