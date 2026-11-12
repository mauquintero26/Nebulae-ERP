'use client';

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3, Calendar, CheckCircle2, Edit2, ExternalLink, ListChecks, Package, RefreshCw, ShoppingCart, Trash2, User, UserPlus, X,
} from 'lucide-react';
// B4 T16B: la Lista de compras 100 % sobre el servidor (R5, C3, C4): la tabla estándar con las pestañas Todos · Pendiente · En
// pedido · Recibido, el tablero solo para ver en modo cliente (hasta 200), las tarjetas lista_* de /compras/lista-compras/stats,
// la franja del flujo con «Estás aquí» en Lista de compras y «Ver análisis» en lugar de la IA simulada (R2, R13). Se conserva lo
// de B1 a B3: la selección de ítems PENDIENTE para crear el pedido de compra (con precios y proveedor al vuelo), el PATCH de
// estado y de proveedor, «Marcar recibido» (sigue como hoy, hueco H14), el DELETE y los enlaces al PVEN y al PEC.
import {
  SubNav, PageHeader, Modal, Button, ContenidoEnlace, MenuFila, useAvisos, FranjaKpis, TarjetaKpi, useEstadoKpi,
  TableroKanban, useTableroKanban,
} from '@/components/ui';
import type { ItemMenuFila } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { AccionTabla, ClaveFila, ColumnaTabla, PestanaTabla } from '@/components/tabla';
import { BannerFlujo, useResumenFlujo } from '@/components/flujo';
import type { DatosFlujo } from '@/components/flujo';
import { useResumen } from '@/components/ui/useResumen';
import { AvisoDeError } from '@/components/ui/AvisoFuente';
import { COMP_NAV } from '../comp-nav';
import { CHIP, textoInstante } from '../columnas-pec';

import { apiFetch } from '@/lib/api';
import { accionModo, accionVistaEnLista, estadoDelTotal } from '@/lib/tabla';
import { tarjetasLista } from '@/lib/kpis';
import { recargarTrasError, textoDeError } from '@/lib/avisos';
import { FOCOS, TABLE, RESERVA_BOTON_IA } from '@/lib/design-system';
import {
  OPCIONES_ESTADOS_TABLERO_LISTA, COLUMNAS_LISTA, consultaLista, consultaTableroLista, avisoTope200, destinoItemLista,
  esItemSeleccionable, fechaItemLista, infoEstadoItemLista, opcionesEstadosLista, tarjetaItemLista, textoSeleccionLista, textoVacioLista,
} from '@/lib/estados-compras';
import { ENLACE_VER_ANALISIS_COMPRAS, avisosFlujoCompras, pasosPantallaCompras, textoReglaCompras } from '@/lib/flujo-compras';

/** Un ítem de GET /compras/lista-compras (el JSON de la Lista; los DESCARTADO no salen). */
type ItemLista = {
  id: number;
  producto: string;
  cantidad: number;
  estado: string;
  notas?: string | null;
  pven_id?: number | null;
  pven_numero?: string | null;
  proveedor?: string | null;
  pec_id?: number | null;
  pec_numero?: string | null;
  fecha?: string | null;
  precio_unitario_cop?: number | string | null;
};
/** `conteos` de GET /compras/lista-compras con con_conteos=1 (T12): cada pestaña, con la búsqueda y los filtros extra (R5). */
type ConteosLista = Partial<Record<'todos' | 'PENDIENTE' | 'EN_PEDIDO' | 'RECIBIDO', number>>;
/** Los filtros extra de la barra que no son del estado de la tabla: el proveedor y el rango de fechas (días de calendario). */
type FiltrosLista = { proveedor: string; desde: string; hasta: string };
type Proveedor = { id?: number; name: string };

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_LISTA = 'compras.lista';
/** La pestaña de trabajo (como hoy): Pendiente. */
const INICIAL_LISTA = { vista: 'PENDIENTE' };
const SIN_FILTROS: FiltrosLista = { proveedor: '', desde: '', hasta: '' };
/** El motivo de un tablero solo para ver (R11, KANBAN-logistica punto 5). */
const TEXTO_SOLO_VER = 'Este tablero es para ver: pasa a En pedido al crear el pedido de compra y a Recibido con la recepción.';
/** El contenedor de los Hubs y de las listas del bloque (T7 a T16A): RESERVA_BOTON_IA (pb-24, F44-a) deja libre la esquina del botón de la IA. */
const CONTENEDOR = `flex-1 flex flex-col px-4 xl:px-8 pt-6 ${RESERVA_BOTON_IA} max-w-[1600px] mx-auto w-full min-w-0 gap-6`;
const FOCO_VISIBLE = FOCOS.purple;
/** El foco sobre la barra oscura de la selección. */
const FOCO_OSCURO = FOCOS.blanco;
/** Las modalidades de pago del pedido de compra: [lo que se manda al servidor, lo que se ve]. */
const MODALIDADES_PAGO = [['Contado', 'Contado'], ['Credito 30d', 'Crédito 30d'], ['Credito 60d', 'Crédito 60d'], ['Adelanto 50%', 'Adelanto 50%'], ['Contra entrega', 'Contra entrega']];
// m12 (y r1, F71): la barra de la selección es textoSeleccionLista de la lib, con sus casos.
const CAMPO = 'border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200';
const ETIQUETA_CAMPO = 'block text-xs font-black text-gray-500 uppercase mb-1';

/** El estado del ítem en las celdas (columna de estados-compras.js: un desconocido sale humanizado, nunca el código). */
function CeldaEstadoItem({ it }: { it: ItemLista }) {
  const { label, clases } = infoEstadoItemLista(it.estado);
  return <span className={`${CHIP} text-[11px] ${clases.bg} ${clases.text} ${clases.border}`}>{label}</span>;
}

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
type AccionesFilaLista = {
  marcarRecibido: (it: ItemLista) => void;
  editarProveedor: (it: ItemLista) => void;
  eliminar: (it: ItemLista) => void;
  /** El ítem cuyo cambio está en camino: mientras tanto, el menú no ofrece otro (un segundo clic no manda otro PATCH). */
  ocupadoId: number | null;
};
const AccionesFila = React.createContext<AccionesFilaLista | null>(null);

/**
 * Acciones (R11): el menú ⋯ (MenuFila: clic y portal) con «Marcar como recibido» (como hoy, hueco H14), «Editar proveedor»
 * (ya no dentro de la celda), los enlaces al PVEN y al PEC y «Eliminar». Antes eran botones que solo aparecían al pasar el
 * mouse. Lleva el producto en su aria-label.
 */
function CeldaAcciones({ it }: { it: ItemLista }) {
  const acciones = useContext(AccionesFila);
  const ocupado = acciones?.ocupadoId != null;
  const enCamino = ocupado ? 'Hay otro cambio en camino.' : undefined;
  const pven = it.pven_id ? `/dashboard/ventas/venta?id=${it.pven_id}` : null;
  const pec = it.pec_id ? `/dashboard/compras/pedidos?id=${it.pec_id}` : null;
  const router = useRouter();
  const items: ItemMenuFila[] = [
    { etiqueta: 'Marcar como recibido', icono: CheckCircle2, onClick: () => acciones?.marcarRecibido(it), oculto: it.estado === 'RECIBIDO',
      deshabilitado: ocupado, titulo: enCamino },
    { etiqueta: 'Editar proveedor', icono: Edit2, onClick: () => acciones?.editarProveedor(it), deshabilitado: ocupado, titulo: enCamino },
    { etiqueta: 'Ver pedido de venta', icono: ExternalLink, onClick: () => { if (pven) router.push(pven); }, oculto: !pven },
    { etiqueta: 'Ver pedido de compra', icono: ExternalLink, onClick: () => { if (pec) router.push(pec); }, oculto: !pec },
    { etiqueta: 'Eliminar', icono: Trash2, peligro: true, onClick: () => acciones?.eliminar(it), deshabilitado: ocupado, titulo: enCamino },
  ];
  return (
    <span className="flex items-center justify-end">
      <MenuFila items={items} etiqueta={`Acciones de ${it.producto}`} />
    </span>
  );
}

/**
 * B4 T16B, la tabla (TABLA-compras punto 10; R26, D41). A 1024 px con el menú abierto la caja de la tabla deja 734 px
 * (medido en el banco de T16A y T16B: contenedor px-4); la casilla de selección toma 40: Producto 120 (la flexible, su piso) +
 * Cant. 64 (el mínimo de una columna) + PVEN 120 (cabe «PVEN-20262799») + Proveedor 100 + PEC 104 + Estado 96 + Acciones 80 = 684,
 * con la casilla 724. Fecha va oculta por defecto (se muestra con «Ajustar tabla»).
 * Una constante (estable, D40); las celdas solo dependen de la fila y del contexto.
 */
const COLUMNAS_TABLA_LISTA: ColumnaTabla<ItemLista>[] = [
  { id: 'producto', titulo: 'Producto', ancho: 120, clave: true, flexible: true, ordenable: 'producto', titleCelda: (it) => it.producto,
    celda: (it) => (
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="block truncate text-xs font-bold text-gray-900">{it.producto}</span>
        {it.notas && <span className="block truncate text-[11px] text-gray-500">{it.notas}</span>}
      </span>
    ) },
  { id: 'cantidad', titulo: 'Cant.', ancho: 64, alinear: 'centro', titleCelda: (it) => String(it.cantidad),
    celda: (it) => <span className="text-xs font-black text-gray-700">{it.cantidad}</span> },
  { id: 'pven', titulo: 'PVEN', ancho: 120, ordenable: 'pven', titleCelda: (it) => it.pven_numero ?? null,
    celda: (it) => (it.pven_numero ? (
      <Link href={`/dashboard/ventas/venta?id=${it.pven_id}`}
        className={`block truncate rounded text-xs font-bold text-indigo-700 hover:underline ${FOCO_VISIBLE}`}>{it.pven_numero}</Link>
    ) : <span className="text-xs text-gray-400">—</span>) },
  { id: 'proveedor', titulo: 'Proveedor', ancho: 100, ordenable: 'proveedor', titleCelda: (it) => it.proveedor ?? 'Sin asignar',
    celda: (it) => (it.proveedor
      ? <span className="block truncate text-xs text-gray-800">{it.proveedor}</span>
      : <span className="text-xs italic text-gray-500">Sin asignar</span>) },
  { id: 'pec', titulo: 'PEC', ancho: 104, titleCelda: (it) => it.pec_numero ?? null,
    celda: (it) => (it.pec_numero ? (
      <Link href={`/dashboard/compras/pedidos?id=${it.pec_id}`}
        className={`block truncate rounded text-xs font-bold text-purple-700 hover:underline ${FOCO_VISIBLE}`}>{it.pec_numero}</Link>
    ) : <span className="text-xs text-gray-400">—</span>) },
  { id: 'estado', titulo: 'Estado', ancho: 96, clave: true, ordenable: 'estado', titleCelda: (it) => infoEstadoItemLista(it.estado).label,
    celda: (it) => <CeldaEstadoItem it={it} /> },
  { id: 'fecha', titulo: 'Fecha', ancho: 92, ocultaPorDefecto: true, ordenable: 'fecha', titleCelda: (it) => textoInstante(it.fecha),
    celda: (it) => <span className="text-xs text-gray-600">{textoInstante(it.fecha)}</span> },
  { id: 'acciones', titulo: 'Acciones', ancho: 80, clave: true, fija: 'derecha', celda: (it) => <CeldaAcciones it={it} /> },
];

/** Una fila recibida se ve apagada (token opaco de TABLE, D41). */
const claseDeFilaLista = (it: ItemLista) => (it.estado === 'RECIBIDO' ? TABLE.filaApagada : null);

/** Las pestañas (sin emojis): Todos · Pendiente · En pedido · Recibido, con los conteos del servidor (null mientras cargan: barra gris). */
function pestanasDeLista(conteos: ConteosLista | null): PestanaTabla[] {
  return [
    { id: 'todos', etiqueta: 'Todos', conteo: conteos?.todos ?? null },
    { id: 'PENDIENTE', etiqueta: 'Pendiente', conteo: conteos?.PENDIENTE ?? null },
    { id: 'EN_PEDIDO', etiqueta: 'En pedido', conteo: conteos?.EN_PEDIDO ?? null },
    { id: 'RECIBIDO', etiqueta: 'Recibido', conteo: conteos?.RECIBIDO ?? null },
  ];
}

/** El ítem que el tablero muestra en cada columna: su estado. */
const columnaDeItem = (it: ItemLista) => it.estado;

function NewSupplierModal({ onSave, onClose }: { onSave: (s: Proveedor) => void; onClose: () => void }) {
  const { avisarError } = useAvisos();
  const [form, setForm] = useState({ name: '', reference: '', contact_name: '', phone: '', email: '', address: '', city: '', country: 'Colombia', payment_terms: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const raw = await apiFetch('/compras/proveedores', { method: 'POST', body: JSON.stringify(form) });
      onSave(raw?.data ?? raw);
    } catch (err) { avisarError(err, 'No se pudo crear el proveedor'); }
    setSaving(false);
  }
  return (
    <Modal cierreExterno={false} title="Nuevo Proveedor" subtitle="Agregar a la agenda de proveedores" color="purple" capa="encima" onClose={onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="new-supplier-form" color="purple" icon={UserPlus} loading={saving}>Agregar Proveedor</Button>
        </>
      )}>
      <form id="new-supplier-form" onSubmit={save} className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><label className={ETIQUETA_CAMPO}>Nombre *<input required value={form.name} onChange={(e) => set('name', e.target.value)} className={`${CAMPO} w-full mt-1 normal-case font-normal text-gray-900`} /></label></div>
        <div><label className={ETIQUETA_CAMPO}>Referencia / NIT<input value={form.reference} onChange={(e) => set('reference', e.target.value)} className={`${CAMPO} w-full mt-1 normal-case font-normal text-gray-900`} /></label></div>
        <div><label className={ETIQUETA_CAMPO}>Contacto<input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} className={`${CAMPO} w-full mt-1 normal-case font-normal text-gray-900`} /></label></div>
        <div><label className={ETIQUETA_CAMPO}>Teléfono<input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={`${CAMPO} w-full mt-1 normal-case font-normal text-gray-900`} /></label></div>
        <div><label className={ETIQUETA_CAMPO}>Email<input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={`${CAMPO} w-full mt-1 normal-case font-normal text-gray-900`} /></label></div>
        <div><label className={ETIQUETA_CAMPO}>Ciudad<input value={form.city} onChange={(e) => set('city', e.target.value)} className={`${CAMPO} w-full mt-1 normal-case font-normal text-gray-900`} /></label></div>
      </form>
    </Modal>
  );
}

/* ================================================================
   MAIN PAGE — ListaComprasPage (B4 T16B)
   ================================================================ */
export default function ListaComprasPage() {
  const pathname = usePathname();
  const router = useRouter();
  const { avisar, avisarError, confirmar } = useAvisos();

  // ── bloque 1: la carga del servidor (TABLA-compras punto 10; R5, C3, C4; D39, D40) ──
  // El estado ÚNICO de la pantalla: las pestañas, la búsqueda (con el retardo de 300 ms de la barra), el filtro de estados, las
  // tarjetas, la tabla y el tablero despachan a él. El proveedor y las fechas son filtros extra de la barra: cada cambio vuelve a la
  // página 1 y limpia la selección. El modo (Lista o Kanban) se guarda en vista:compras.lista.
  const [estado, despachar, listo] = useEstadoTabla(ID_LISTA, INICIAL_LISTA);
  const enKanban = estado.modo === 'kanban';
  const [filtros, setFiltros] = useState<FiltrosLista>(SIN_FILTROS);
  const [seleccion, setSeleccion] = useState<ClaveFila[]>([]);
  const [ocupadoId, setOcupadoId] = useState<number | null>(null);

  // La tabla: la página (25 o 50) de GET /compras/lista-compras. La pestaña viaja como `estados` (el servidor no tiene `vista`),
  // cruzada con el filtro (consultaLista). esperar: !listo (D40): el esqueleto, nunca «vacío». Los conteos de las pestañas vienen en
  // la MISMA llamada (con la búsqueda y los filtros extra, sin la pestaña).
  const extraDeLaLista = useMemo(() => consultaLista(estado, filtros), [estado, filtros]);
  const listado = useListado<ItemLista>({
    ruta: '/compras/lista-compras', estado, conConteos: true, esperar: !listo, despachar, activo: !enKanban, extra: extraDeLaLista,
  });
  const conteos = listado.conteos as ConteosLista | null;
  const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);

  // El tablero (modo cliente): los 200 más recientes con el mismo estado, otra consulta activa solo en Kanban (la tabla nunca se ve
  // con las 200 filas del tablero). El endpoint de la Lista devuelve todo lo que se pida (C4).
  const extraDelTablero = useMemo(() => consultaTableroLista(estado, filtros), [estado, filtros]);
  const completa = useListado<ItemLista>({
    ruta: '/compras/lista-compras', estado, esperar: !listo, activo: enKanban, extra: extraDelTablero,
  });

  // La franja del flujo (FLUJO-compras punto 10; R9, RP46, D36, D42): GET /compras/flujo; recargaFlujo sube con cada recarga.
  const [recargaFlujo, setRecargaFlujo] = useState(0);
  const flujo = useResumenFlujo<DatosFlujo>('/compras/flujo', recargaFlujo);

  // Las tarjetas (KPI-compras punto 9; R7, R12): GET /compras/lista-compras/stats, sin respaldo local. Mientras no llega,
  // 'cargando' (nunca 0); si falla, «—».
  const [vueltaStats, setVueltaStats] = useState(0);
  // B4 T24 f3 (F45): el cargador compartido de los resúmenes (useResumen: aborta la anterior, descarta las viejas, va atado al usuario,
  // conserva lo último al recargar y con error no deja datos viejos: «—»).
  const stats = useResumen('/compras/lista-compras/stats', vueltaStats);
  const cargandoStats = stats.cargando;
  const estadoKpis = useEstadoKpi(cargandoStats, stats.error);
  const tarjetas = tarjetasLista(stats.datos);

  // «Actualizar» y lo que sigue a un cambio: la tabla con sus conteos, el tablero (el que no se ve se recarga al activarse), la
  // franja y las tarjetas. Ninguna recarga vacía lo que se ve: los hooks conservan lo último.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarCompleta } = completa;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarCompleta();
    setRecargaFlujo((n) => n + 1);
    setVueltaStats((n) => n + 1);
  }, [recargarListado, recargarCompleta]);

  // ── filtros extra de la barra: proveedor (con el retardo de 300 ms) y fechas ──
  // Cada cambio vuelve a la página 1 y limpia la selección (R5).
  const [proveedorTexto, setProveedorTexto] = useState('');
  const [verFechas, setVerFechas] = useState(false);
  const cambiarFiltros = useCallback((cambio: Partial<FiltrosLista>) => {
    setFiltros((f) => ({ ...f, ...cambio }));
    setSeleccion([]);
    despachar({ tipo: 'pagina', valor: 1 });
  }, [despachar]);
  useEffect(() => {
    if (proveedorTexto.trim() === filtros.proveedor) return undefined;
    const espera = setTimeout(() => cambiarFiltros({ proveedor: proveedorTexto.trim() }), 300);
    return () => clearTimeout(espera);
  }, [proveedorTexto, filtros.proveedor, cambiarFiltros]);
  const filtrarProveedor = (proveedor: string) => { setProveedorTexto(proveedor); cambiarFiltros({ proveedor }); };
  const hayFechas = Boolean(filtros.desde || filtros.hasta);

  // ── bloque 6: cambiar un ítem (PATCH de estado y de proveedor, DELETE) ──
  // Si el servidor dice que no, su mensaje tal cual (avisarError). Un ítem con un cambio en camino no ofrece otro (ocupadoId).
  const cambiarItem = useCallback(async (it: ItemLista, accion: () => Promise<string>, fallo: string): Promise<boolean> => {
    setOcupadoId(it.id);
    try {
      avisar(await accion(), { tono: 'ok' });
      setSeleccion((s) => s.filter((c) => String(c) !== String(it.id)));
      recargarTodo();
      return true;
    } catch (err) {
      avisarError(err, fallo);
      // La regla única (recargarTrasError): con un 400, un 409, un 422 (F8) o sin respuesta (otro cambió el ítem) recarga; 404 o 500, no.
      if (recargarTrasError(err)) recargarTodo();
      return false;
    } finally {
      setOcupadoId(null);
    }
  }, [avisar, avisarError, recargarTodo]);
  const marcarRecibido = useCallback((it: ItemLista) => {
    void cambiarItem(it, async () => {
      await apiFetch(`/compras/lista-compras/${it.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'RECIBIDO' }) });
      return 'Marcado como recibido';
    }, `No se pudo marcar «${it.producto}» como recibido`);
  }, [cambiarItem]);
  const eliminar = useCallback(async (it: ItemLista) => {
    if (!(await confirmar({ titulo: 'Eliminar ítem', mensaje: `¿Eliminar «${it.producto}» de la lista de compras?`, textoConfirmar: 'Eliminar', peligro: true }))) return;
    void cambiarItem(it, async () => {
      await apiFetch(`/compras/lista-compras/${it.id}`, { method: 'DELETE' });
      return 'Ítem eliminado';
    }, `No se pudo eliminar «${it.producto}»`);
  }, [confirmar, cambiarItem]);

  // El proveedor se edita en una ventana (antes dentro de la celda, que ya no se arma con estado de la pantalla).
  const [editando, setEditando] = useState<ItemLista | null>(null);
  const [proveedorNuevo, setProveedorNuevo] = useState('');
  const editarProveedor = useCallback((it: ItemLista) => { setEditando(it); setProveedorNuevo(it.proveedor ?? ''); }, []);
  const guardarProveedor = async () => {
    if (!editando) return;
    const it = editando;
    // m6: la ventana se cierra solo si el PATCH salió bien; si falla sigue abierta con lo escrito y el error a la vista.
    if (await cambiarItem(it, async () => {
      await apiFetch(`/compras/lista-compras/${it.id}`, { method: 'PATCH', body: JSON.stringify({ proveedor: proveedorNuevo }) });
      return 'Proveedor actualizado';
    // B4 T24 f3 (F70): se cierra solo la ventana de ESE ítem (si mientras tanto se abrió otra, queda abierta con lo escrito).
    }, 'No se pudo actualizar el proveedor')) setEditando((e) => (e?.id === it.id ? null : e));
  };

  const accionesFila = useMemo<AccionesFilaLista>(() => ({
    marcarRecibido, editarProveedor, eliminar: (it) => { void eliminar(it); }, ocupadoId,
  }), [marcarRecibido, editarProveedor, eliminar, ocupadoId]);

  // ── el pedido de compra desde la selección (B1 a B3, sin cambios de comportamiento) ──
  const [showPecModal, setShowPecModal] = useState(false);
  const [pecModalItems, setPecModalItems] = useState<ItemLista[]>([]);
  const [suppliers, setSuppliers] = useState<Proveedor[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Proveedor | null>(null);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [pecForm, setPecForm] = useState({ dias_entrega: 15, modalidad_pago: 'Contado', tipo_envio: 'casillero', notas: '' });
  const [pecSaving, setPecSaving] = useState(false);
  const supplierTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSupplierSearch = (q: string) => {
    setSupplierSearch(q);
    setSelectedSupplier(null);
    setShowNewSupplier(false);
    if (supplierTimer.current) clearTimeout(supplierTimer.current);
    if (!q.trim()) { setSuppliers([]); return; }
    supplierTimer.current = setTimeout(async () => {
      try {
        const d = await apiFetch(`/compras/proveedores/search?q=${encodeURIComponent(q)}`);
        const arr: Proveedor[] = Array.isArray(d) ? d : (d?.data ?? []);
        setSuppliers(arr);
        if (arr.length === 0) setShowNewSupplier(true);
      } catch (err) { avisarError(err, 'No se pudo buscar el proveedor'); }
    }, 300);
  };

  // Los ítems seleccionados de la página que se ve (solo PENDIENTE: esItemSeleccionable).
  const itemsSeleccionados = seleccion
    .map((c) => listado.filas.find((f) => String(f.id) === String(c)))
    .filter((f): f is ItemLista => Boolean(f) && esItemSeleccionable(f));
  const openPecModal = (itemsToOrder: ItemLista[]) => {
    setPecModalItems(itemsToOrder.map((it) => ({ ...it, precio_unitario_cop: it.precio_unitario_cop || 0 })));
    setSelectedSupplier(null);
    setSupplierSearch('');
    setSuppliers([]);
    setShowNewSupplier(false);
    const pvens = [...new Set(itemsToOrder.map((it) => it.pven_numero).filter(Boolean))];
    setPecForm({ dias_entrega: 15, modalidad_pago: 'Contado', tipo_envio: 'casillero', notas: `Desde Lista de Compras - ${pvens.join(', ')}` });
    setShowPecModal(true);
  };
  const setItemPrecio = (id: number, precio: string) => {
    setPecModalItems((prev) => prev.map((it) => (it.id === id ? { ...it, precio_unitario_cop: precio } : it)));
  };

  const handleCrearPEC = async () => {
    if (!pecModalItems.length) return;
    const sinPrecio = pecModalItems.find((it) => !(Number(it.precio_unitario_cop) > 0));
    if (sinPrecio) {
      avisar(`«${sinPrecio.producto}» no tiene precio. Ingresa un precio antes de crear el pedido de compra.`, { tono: 'error' });
      return;
    }
    setPecSaving(true);
    try {
      const user = localStorage.getItem('user_name') || '';
      const totalCalc = pecModalItems.reduce((s, it) => s + Number(it.cantidad || 0) * Number(it.precio_unitario_cop || 0), 0);
      const pec = await apiFetch('/compras/pedidos', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: selectedSupplier?.id,
          supplier_name: selectedSupplier?.name || supplierSearch,
          ven_id: pecModalItems[0]?.pven_id,
          ven_numero: pecModalItems[0]?.pven_numero,
          dias_entrega: pecForm.dias_entrega,
          modalidad_pago: pecForm.modalidad_pago,
          tipo_envio: pecForm.tipo_envio,
          notas: pecForm.notas,
          productos: pecModalItems.map((it) => ({ producto_nombre: it.producto, qty: it.cantidad, unit_price_cop: Number(it.precio_unitario_cop) })),
          subtotal_cop: totalCalc,
          total_cop: totalCalc,
          created_by: user,
        }),
      });
      const pecObj = pec?.data ?? pec;
      // Vincula CADA ítem seleccionado (puede ser de distintos PVEN) a este PEC; el PATCH ya se encarga de propagar pec_id/estado
      // al Pedido de Venta de cada uno. Si alguno falla, el pedido de compra ya existe: se dice cuáles no quedaron vinculados.
      const sinVincular: string[] = [];
      for (const it of pecModalItems) {
        try {
          await apiFetch(`/compras/lista-compras/${it.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: 'EN_PEDIDO', pec_id: pecObj.id, pec_numero: pecObj.numero }),
          });
        } catch (err) { sinVincular.push(`«${it.producto}» (${textoDeError(err)})`); }
      }
      if (sinVincular.length > 0) {
        avisar(`PEC ${pecObj.numero || ''} creado, pero no se pudo vincular: ${sinVincular.join('; ')}.`, { tono: 'error' });
      } else {
        avisar(`PEC ${pecObj.numero || ''} creado con ${pecModalItems.length} producto(s)`, { tono: 'ok' });
      }
      setShowPecModal(false);
      setSeleccion([]);
      recargarTodo();
    } catch (err) {
      avisarError(err, 'No se pudo crear el pedido de compra');
      if (recargarTrasError(err)) recargarTodo();
    } finally { setPecSaving(false); }
  };

  // ── bloque 2: la tabla (TABLA-compras punto 10; R5, R26, D40, D41) ──
  const prefs = usePreferenciasTabla(ID_LISTA, COLUMNAS_TABLA_LISTA);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa: pantallaCompleta, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  const pestanas = pestanasDeLista(conteos);
  // m2 de T8: el conmutador Lista / Kanban poda los estados con las opciones del modo nuevo, con la regla de accionPestana.
  const alCambiarBarra = useCallback((accion: AccionTabla) => {
    if (accion.tipo === 'modo') {
      const modo = String(accion.valor);
      despachar(accionModo(estado, modo, modo === 'kanban' ? OPCIONES_ESTADOS_TABLERO_LISTA : opcionesEstadosLista, COLUMNAS_LISTA));
    } else despachar(accion);
  }, [estado, despachar]);
  const vacio = useMemo(() => {
    const texto = textoVacioLista({ vista: estado.vista, q: estado.q, estados: estado.estados }, filtros);
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        {texto.ayuda && <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>}
      </div>
    );
  }, [estado.vista, estado.q, estado.estados, filtros]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: listado.total,
    estadoTotal: estadoDelTotal({ total: listado.total, cargando: listado.cargandoInicial, recargando: listado.recargando, error: listado.error }),
  };
  const alSeleccionar = useCallback((claves: ClaveFila[]) => setSeleccion(claves), []);
  const pieSeleccion = seleccion.length > 0
    ? <span className="font-bold text-purple-700">{seleccion.length} {seleccion.length === 1 ? 'seleccionado' : 'seleccionados'}</span>
    : null;

  // ── bloque 3: el tablero solo para ver (KANBAN-logistica punto 5; R11, C4, RP95) ──
  // Modo cliente: los ítems de la consulta completa agrupados por su estado (columnaDeItem). Mientras llegan, el tablero carga
  // (items null); items estable: useMemo. El clic abre el PEC vinculado o, sin PEC, el PVEN.
  const itemsTablero = useMemo<ItemLista[] | null>(
    () => (completa.cargandoInicial || (completa.error != null && completa.filas.length === 0) ? null : completa.filas),
    [completa.cargandoInicial, completa.filas, completa.error],
  );
  const tablero = useTableroKanban<ItemLista>({
    pantalla: ID_LISTA,
    modo: 'cliente',
    columnas: COLUMNAS_LISTA,
    activo: listo && enKanban,
    porColumna: estado.tamano,
    items: itemsTablero,
    columnaDe: columnaDeItem,
    fechaMovimiento: fechaItemLista,
  });
  const abrirItem = useCallback((it: ItemLista) => {
    const destino = destinoItemLista(it);
    if (destino) router.push(destino);
    else avisar('Este ítem no tiene un pedido de venta ni un pedido de compra vinculado.', { tono: 'info' });
  }, [router, avisar]);
  const textoTope = enKanban && !completa.cargandoInicial ? avisoTope200(completa.total, 'ítems') : null;
  const errorTablero = enKanban && completa.error != null;
  const avisoTablero = (textoTope || errorTablero) ? (
    <div className="flex flex-col gap-1">
      {errorTablero && (
        <p role="alert">
          {textoDeError(completa.error, 'No se pudo cargar la lista de compras')}.{' '}
          <button type="button" onClick={completa.recargar} className={`rounded font-bold text-purple-700 underline ${FOCO_VISIBLE}`}>Reintentar</button>
        </p>
      )}
      {textoTope && <p>{textoTope}</p>}
    </div>
  ) : undefined;

  // ── bloque 4: las tarjetas (KPI-compras punto 9; R5, R12) ──
  // Cada una abre su pestaña (D41: como un clic en ella; tocar la activa vuelve a Todos). En Kanban abren esa pestaña en Lista.
  const vistaActiva = enKanban ? null : estado.vista;
  const elegirVista = (vista: string) => {
    const siguiente = vistaActiva === vista ? 'todos' : vista;
    despachar(accionVistaEnLista(estado, siguiente, opcionesEstadosLista));
  };
  const actualizando = listado.recargando || completa.recargando || flujo.cargando || (cargandoStats && stats.datos !== null);

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      <SubNav label="Hub de Compras" items={COMP_NAV} currentPath={pathname} color="purple" hub={{ href: '/dashboard/compras' }} />

      {/* B4 T16B (FLUJO-compras punto 10; R9, RP42, D42): la franja con «Estás aquí» en Lista de compras. Sin semáforo (la lista
          no tiene atraso propio) ni «No resueltos». Va directo bajo la barra de submódulos, sin otro padding. */}
      <BannerFlujo
        titulo="Flujo de compras"
        idPreferencia={ID_LISTA}
        regla={textoReglaCompras()}
        pasos={pasosPantallaCompras(flujo.datos, 'LISTA')}
        avisos={avisosFlujoCompras(flujo.datos)}
        cargando={flujo.cargando}
        error={flujo.error}
        onReintentar={flujo.recargar}
      />

      <div className={CONTENEDOR}>

        <PageHeader icon={ListChecks} color="purple"
          title="Lista de Productos por Comprar"
          subtitle="Productos pendientes de compra desde Pedidos de Venta"
          actions={(
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={recargarTodo}
                className={`flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm shadow-sm transition-colors ${FOCO_VISIBLE}`}>
                <RefreshCw size={14} aria-hidden="true" className={actualizando ? 'animate-spin' : ''} /> Actualizar
              </button>
              {/* R13 (ANALISIS-compras punto 5): «Ver análisis» abre el Análisis del Hub de Compras (?tab=analisis). */}
              <Link href={ENLACE_VER_ANALISIS_COMPRAS}
                className={`flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-purple-50 hover:text-purple-800 hover:border-purple-200 font-semibold text-sm shadow-sm transition-colors ${FOCO_VISIBLE}`}>
                <ContenidoEnlace icon={BarChart3}>Ver análisis</ContenidoEnlace>
              </Link>
            </div>
          )} />

        {/* B4 T16B (KPI-compras punto 9; R7, R12): las 4 tarjetas de /compras/lista-compras/stats: mientras cargan, barras
            grises (nunca 0); con error, «—». Cada una abre su pestaña. */}
        <FranjaKpis estado={estadoKpis} titulo="Lista de compras">
          <TarjetaKpi kpi="lista_pendientes" valor={tarjetas?.pendientes.valor ?? null}
            activo={vistaActiva === 'PENDIENTE'} onClick={() => elegirVista('PENDIENTE')} />
          <TarjetaKpi kpi="lista_en_pedido" valor={tarjetas?.en_pedido.valor ?? null}
            activo={vistaActiva === 'EN_PEDIDO'} onClick={() => elegirVista('EN_PEDIDO')} />
          <TarjetaKpi kpi="lista_recibidos" valor={tarjetas?.recibidos.valor ?? null}
            activo={vistaActiva === 'RECIBIDO'} onClick={() => elegirVista('RECIBIDO')} />
          <TarjetaKpi kpi="lista_total" valor={tarjetas?.total.valor ?? null}
            activo={vistaActiva === 'todos'} onClick={() => elegirVista('todos')} />
        </FranjaKpis>
        {/* B4 T24 f3 (FINAL-m14, F84): si /stats falla, su detalle y «Reintentar» solo para él; un 403 no lo ofrece. */}
        {estadoKpis === 'error' && (
          <AvisoDeError error={stats.error} fallo="No se pudieron cargar los indicadores de la lista de compras" onReintentar={stats.recargar} acento="purple" />
        )}

        {/* B4 T16B (TABLA-compras punto 10, KANBAN-logistica punto 5): la barra y la tabla estándar en el servidor, o el tablero
            solo para ver en modo cliente, con el MISMO estado (búsqueda y estados) y los mismos filtros extra. En Kanban las
            pestañas no se ven (el tablero trae todas por columna). */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <AccionesFila.Provider value={accionesFila}>
            <section ref={refTarjeta} className={claseTarjeta}>
              <BarraTabla
                estado={estado}
                onEstado={alCambiarBarra}
                pestanas={enKanban ? undefined : pestanas}
                estadoConteos={estadoConteos}
                placeholder="Buscar producto, PVEN o proveedor…"
                opcionesEstados={enKanban ? OPCIONES_ESTADOS_TABLERO_LISTA : opcionesEstadosLista}
                filtros={(
                  <>
                    <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
                      <User size={14} aria-hidden="true" className="shrink-0 text-gray-500" />
                      <input value={proveedorTexto} onChange={(e) => setProveedorTexto(e.target.value)} aria-label="Filtrar por proveedor"
                        placeholder="Proveedor…" className={`w-32 rounded bg-transparent text-xs placeholder-gray-500 ${FOCO_VISIBLE}`} />
                      {proveedorTexto && (
                        <button type="button" aria-label="Quitar el filtro de proveedor" onClick={() => filtrarProveedor('')}
                          className={`rounded text-gray-500 hover:text-gray-800 ${FOCO_VISIBLE}`}><X size={13} aria-hidden="true" /></button>
                      )}
                    </label>
                    <button type="button" onClick={() => setVerFechas((v) => !v)} aria-expanded={verFechas || hayFechas}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${FOCO_VISIBLE} ${
                        verFechas || hayFechas ? 'border-purple-300 bg-purple-50 text-purple-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}>
                      <Calendar size={14} aria-hidden="true" /> Fecha
                      {hayFechas && <span className="rounded-full bg-purple-700 px-1.5 py-0.5 text-[10px] font-black text-white">1</span>}
                    </button>
                    {(verFechas || hayFechas) && (
                      <>
                        <input type="date" value={filtros.desde} onChange={(e) => cambiarFiltros({ desde: e.target.value })} aria-label="Desde"
                          className={`rounded-xl border border-gray-200 px-3 py-2 text-xs shadow-sm ${FOCO_VISIBLE}`} />
                        <span aria-hidden="true" className="text-sm text-gray-500">→</span>
                        <input type="date" value={filtros.hasta} onChange={(e) => cambiarFiltros({ hasta: e.target.value })} aria-label="Hasta"
                          className={`rounded-xl border border-gray-200 px-3 py-2 text-xs shadow-sm ${FOCO_VISIBLE}`} />
                        {hayFechas && (
                          <button type="button" onClick={() => cambiarFiltros({ desde: '', hasta: '' })}
                            className={`rounded text-xs font-bold text-red-700 hover:underline ${FOCO_VISIBLE}`}>Limpiar fechas</button>
                        )}
                      </>
                    )}
                  </>
                )}
                ajustes={{ columnas: COLUMNAS_TABLA_LISTA, preferencias: prefs, anchoRef: anchoTablaRef }}
                kanbanDisponible
                pantallaCompleta={enKanban ? undefined : { completa: pantallaCompleta, alternar }}
                color="purple"
                {...totalDeLaBarra}
              />
              {/* La tabla estándar en el servidor: la paginación (25 o 50), el orden por columna y la selección de los PENDIENTE. */}
              {!enKanban && (
                <TablaEstandar
                  id={ID_LISTA}
                  modo="servidor"
                  columnas={COLUMNAS_TABLA_LISTA}
                  preferencias={prefs}
                  anchoRef={anchoTablaRef}
                  estado={estado}
                  onEstado={despachar}
                  filas={listado.filas}
                  total={listado.total}
                  cargando={listado.cargandoInicial}
                  recargando={listado.recargando}
                  error={listado.error}
                  onReintentar={listado.recargar}
                  aviso={listado.avisoOrden}
                  claseFila={claseDeFilaLista}
                  seleccion={seleccion}
                  onSeleccion={alSeleccionar}
                  seleccionable={esItemSeleccionable}
                  pie={pieSeleccion}
                  vacio={vacio}
                  etiqueta="Lista de compras"
                />
              )}
            </section>
          </AccionesFila.Provider>
          {enKanban ? (
            /* KANBAN-logistica punto 5: Pendiente · En pedido · Recibido (plegada), solo para ver: sin regla, con su motivo. */
            <TableroKanban
              tablero={tablero}
              soloLectura={TEXTO_SOLO_VER}
              tarjetaDe={tarjetaItemLista}
              onAbrir={abrirItem}
              aviso={avisoTablero}
              color="purple"
              vacio="Sin ítems aquí"
            />
          ) : null}
        </div>

      </div>

      {/* Barra de selección: crear el pedido de compra con los ítems PENDIENTE elegidos (B1 a B3). La selección es de la página
          de la tabla, así que solo en Lista. */}
      {seleccion.length > 0 && !enKanban && (
        <div className="fixed bottom-8 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 text-white shadow-2xl">
          <span className="rounded-full bg-slate-800 px-3 py-1 text-sm font-bold">{textoSeleccionLista(seleccion.length, itemsSeleccionados.length)}</span>
          <button type="button" onClick={() => openPecModal(itemsSeleccionados)} disabled={itemsSeleccionados.length === 0}
            className={`flex items-center gap-2 rounded-xl bg-purple-500/20 px-3 py-1.5 text-xs font-bold text-purple-200 transition-colors hover:bg-purple-500/40 disabled:opacity-50 ${FOCO_OSCURO}`}>
            <ShoppingCart size={14} aria-hidden="true" /> Crear Pedido de Compra con seleccionados
          </button>
          <button type="button" onClick={() => setSeleccion([])} aria-label="Quitar la selección" title="Quitar la selección"
            className={`rounded-lg p-1.5 text-slate-400 hover:text-white ${FOCO_OSCURO}`}><X size={14} aria-hidden="true" /></button>
        </div>
      )}

      {/* Editar el proveedor de un ítem */}
      {editando && (
        <Modal cierreExterno={false} title="Editar proveedor" subtitle={editando.producto} color="purple" maxWidth="md" onClose={() => setEditando(null)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button color="purple" icon={Package} loading={ocupadoId === editando.id} disabled={ocupadoId != null} onClick={guardarProveedor}>Guardar proveedor</Button>
            </>
          )}>
          <label className={ETIQUETA_CAMPO}>Proveedor
            <input autoFocus value={proveedorNuevo} onChange={(e) => setProveedorNuevo(e.target.value)} placeholder="Nombre del proveedor"
              className={`${CAMPO} w-full mt-1 normal-case font-normal text-gray-900`} />
          </label>
        </Modal>
      )}

      {/* Modal Crear PEC */}
      {showPecModal && pecModalItems.length > 0 && (
        <Modal cierreExterno={false} title="Crear Pedido de Compra" subtitle={`${pecModalItems.length} producto(s) seleccionado(s)`}
          color="purple" maxWidth="md" onClose={() => setShowPecModal(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowPecModal(false)}>Cancelar</Button>
              <Button color="purple" icon={ShoppingCart} loading={pecSaving} onClick={handleCrearPEC}>Crear PEC</Button>
            </>
          )}>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 max-h-48 overflow-y-auto space-y-2">
            {pecModalItems.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-2 text-xs text-gray-700">
                <div className="min-w-0">
                  <p className="truncate">{it.producto} {it.pven_numero && <span className="text-gray-500">· {it.pven_numero}</span>}</p>
                  <p className="text-gray-500">× {it.cantidad}</p>
                </div>
                <div className="shrink-0 w-32">
                  <input type="number" min="0" value={it.precio_unitario_cop || ''} onChange={(e) => setItemPrecio(it.id, e.target.value)}
                    aria-label={`Precio de ${it.producto}`} placeholder="Precio COP"
                    className={'w-full border rounded-lg px-2 py-1.5 text-xs text-right outline-none focus:ring-2 focus:ring-purple-200 ' + (!(Number(it.precio_unitario_cop) > 0) ? 'border-red-300 bg-red-50' : 'border-gray-200')} />
                </div>
              </div>
            ))}
          </div>
          <div>
            <label className={ETIQUETA_CAMPO} htmlFor="lista-proveedor-pec">Proveedor</label>
            <input id="lista-proveedor-pec" value={supplierSearch} onChange={(e) => onSupplierSearch(e.target.value)}
              placeholder="Buscar proveedor..." className={`${CAMPO} w-full`} />
            {suppliers.length > 0 && (
              <div className="border border-gray-200 rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto">
                {suppliers.map((s) => (
                  <button key={s.id} type="button" onClick={() => { setSelectedSupplier(s); setSupplierSearch(s.name); setSuppliers([]); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm font-medium border-b last:border-0">
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            {selectedSupplier && (
              <p className="text-xs text-purple-800 font-bold mt-1">✓ {selectedSupplier.name} seleccionado</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ETIQUETA_CAMPO} htmlFor="lista-dias-entrega">Días de entrega</label>
              <input id="lista-dias-entrega" type="number" min="1" value={pecForm.dias_entrega} onChange={(e) => setPecForm((f) => ({ ...f, dias_entrega: Number(e.target.value) }))}
                className={`${CAMPO} w-full`} />
            </div>
            <div>
              <label className={ETIQUETA_CAMPO} htmlFor="lista-modalidad">Modalidad</label>
              <select id="lista-modalidad" value={pecForm.modalidad_pago} onChange={(e) => setPecForm((f) => ({ ...f, modalidad_pago: e.target.value }))}
                className={`${CAMPO} w-full`}>
                {MODALIDADES_PAGO.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={ETIQUETA_CAMPO} htmlFor="lista-tipo-envio">Tipo de envío</label>
              <select id="lista-tipo-envio" value={pecForm.tipo_envio} onChange={(e) => setPecForm((f) => ({ ...f, tipo_envio: e.target.value }))}
                className={`${CAMPO} w-full`}>
                <option value="casillero">Vía casillero</option>
                <option value="directo">Directo Colombia</option>
              </select>
            </div>
          </div>
          <div>
            <label className={ETIQUETA_CAMPO} htmlFor="lista-notas-pec">Notas</label>
            <textarea id="lista-notas-pec" value={pecForm.notas} onChange={(e) => setPecForm((f) => ({ ...f, notas: e.target.value }))}
              rows={2} className={`${CAMPO} w-full resize-none`} />
          </div>
        </Modal>
      )}

      {/* Nested modal: crear proveedor al vuelo desde el modal de PEC (capa="encima": queda sobre el modal de PEC). */}
      {showNewSupplier && (
        <NewSupplierModal
          onSave={(s) => { setSelectedSupplier(s); setSupplierSearch(s.name); setSuppliers([]); setShowNewSupplier(false); }}
          onClose={() => setShowNewSupplier(false)}
        />
      )}
    </div>
  );
}
