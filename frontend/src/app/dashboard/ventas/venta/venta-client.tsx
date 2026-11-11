'use client';

export const dynamic = 'force-dynamic';
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, createContext, useContext } from 'react';
import Link from 'next/link';
// B4 T10: se fueron Search, MoreHorizontal, FileText y Package de la lista hecha a mano (la búsqueda, el ⋯ propio, las
// StatCard y la pestaña Análisis); entra BarChart3 («Ver análisis»). B4 T24 f2 (F47): Truck y Package de «Marcar En tránsito / En
// proceso» pasan con sus acciones a acciones-tablero-pedidos.ts.
import {
  RefreshCw, X, FileCheck, AlertCircle, ShoppingCart, DollarSign, UserPlus, BarChart3,
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { formatoPesos } from '@/lib/pesos';
import { transicionesPedido } from '@/lib/estados-pedido';
// B4 T10: la lista ya no cuenta ni filtra en el navegador (kpisPedidos, opcionesFiltroEstado, grupoPedido y la búsqueda
// con coincideProducto): las vistas, los conteos y las tarjetas son del servidor (T6B y T6C). Lo de cada fila sigue
// saliendo de las librerías.
import {
  tarjetasPedidos, saldoVisiblePedido, alertaEntregaPedido, diaDeNegocio, rutaSinParametro, accionVistaEnLista,
} from '@/lib/listas-ventas';
import { pedidoAdmitePxp } from '@/lib/dinero-ventas';
import {
  SubNav, PageHeader, Button, Modal, ContenidoEnlace, FranjaKpis, TarjetaKpi, useEstadoKpi, MenuFila, ModalMotivo,
  TableroKanban, EsqueletoTablero, useTableroKanban, CLASE_CHIP, useAvisos,
} from '@/components/ui';
import type { DatosColumnaKanban, ItemMenuFila } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ClaveFila, ColumnaTabla, PestanaTabla } from '@/components/tabla';
import { BannerFlujo, useResumenFlujo } from '@/components/flujo';
import type { DatosFlujo, FiltroSemaforo } from '@/components/flujo';
import {
  accionModo, accionPestana, dependenciasTablero, estadoDelTotal, llegadaDeListado, normalizarRespuesta,
} from '@/lib/tabla';
import type { AccionTabla } from '@/lib/tabla';
import { alternarPaso } from '@/lib/flujo';
import { enlaceVerAnalisis, leerEnlacePedidos, pasosDePedidos, textoRegla, vistaDePasoPedido } from '@/lib/flujo-ventas';
import {
  COLUMNAS_PEDIDO, OPCIONES_ESTADOS_TABLERO_PEDIDO, RUTA_LISTA_PEDIDOS, chipsDocumentoVentas, consultaColumnaPedido,
  efectosCancelarPedido, estadoDeTarjeta, estadosConsultaPedidos, opcionesEstadosPedidos, porEstadoVisto, reglaSoltarPedido,
  resumenColumnaPedido, tarjetaPedido,
} from '@/lib/kanban-ventas';
import type { PorEstadoVisto } from '@/lib/kanban-ventas';
import { fechaCorta, fechaSolo } from '@/lib/fechas-colombia';
import { PERIODO_KPI } from '@/lib/kpis';
import { recargarTrasError, textoDeError } from '@/lib/avisos';
import { FOCOS, RESERVA_BOTON_IA, TABLE } from '@/lib/design-system';
import { accesoTableroVentas } from '@/lib/roles';
import { useRolActual } from '@/components/ui/useRolActual';
// B4 T24 f2 (F45): el cargador compartido de los resúmenes de las tarjetas.
import { useResumen } from '@/components/ui/useResumen';
import { VEN_NAV } from '../ven-nav';
import { getUsuarioActual, puedeCrearOrdenDePago } from '../flujo';
// B4 T24 f2 (F47): las acciones del tablero, las mismas de E-Commerce.
import { useAccionesTableroPedidos } from '../acciones-tablero-pedidos';

export function NewSupplierModal({onSave, onClose}: {onSave:(s:any)=>void; onClose:()=>void}) {
  const [form, setForm] = useState({name:'',reference:'',contact_name:'',phone:'',email:'',address:'',city:'',country:'Colombia',payment_terms:'',notes:''});
  const [saving, setSaving] = useState(false);
  // H49 (T1B): el error se muestra dentro de la ventana, sin cerrarla ni borrar lo escrito; se borra al editar.
  const [error, setError] = useState('');
  const set = (k:string,v:string) => { setError(''); setForm(f=>({...f,[k]:v})); };
  async function save(e:React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try { const raw = await apiFetch('/compras/proveedores',{method:'POST',body:JSON.stringify(form)}); onSave(raw?.data ?? raw); }
    catch(err:any) { setError(textoDeError(err, 'No se pudo crear el proveedor')); }
    setSaving(false);
  }
  return (
    <Modal cierreExterno={false} title="Nuevo Proveedor" subtitle="Agregar a la agenda de proveedores" icon={UserPlus} color="purple"
      // Mientras guarda no se cierra (ni la X ni 'Cancelar'): el resultado siempre llega a una ventana abierta.
      onClose={()=>{ if (!saving) onClose(); }} bloquearCierre={saving}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="new-supplier-form" color="purple" icon={UserPlus} loading={saving}>Agregar Proveedor</Button>
        </>
      )}>
      <form id="new-supplier-form" onSubmit={save} className="grid grid-cols-2 gap-4">
        {error && <p role="alert" className="col-span-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="col-span-2"><label className="block text-xs font-black text-gray-500 uppercase mb-1">Nombre *</label><input required value={form.name} onChange={e=>set('name',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
        <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Referencia / NIT</label><input value={form.reference} onChange={e=>set('reference',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
        <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Contacto</label><input value={form.contact_name} onChange={e=>set('contact_name',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
        <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Teléfono</label><input value={form.phone} onChange={e=>set('phone',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
        <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Email</label><input type="email" value={form.email} onChange={e=>set('email',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
        <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Ciudad</label><input value={form.city} onChange={e=>set('city',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
        <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Términos de Pago</label><input value={form.payment_terms} onChange={e=>set('payment_terms',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
      </form>
    </Modal>
  );
}

const fCOP  = formatoPesos;

// ── B4 T10: las piezas de la lista (TABLA-listas-ventas, KANBAN-ventas-listas, KPI-ventas y FLUJO-ventas-pantallas) ──
// El modelo es el de Solicitudes (T8) y Cotizaciones (T9): un estado único, la tabla estándar y el tablero en el
// servidor y la franja del flujo; las tarjetas leen los kpis de /ventas/stats (RP19, D5).

/**
 * Una fila de GET /ventas/pedidos (T6B): el _ven_dict del pedido, el asesor de H4 (advisor_name) y tipo, resolucion,
 * dias_sin_mov, dias_creado y seguimiento_estado (R8, C14). La resolución y el atraso son los del servidor: aquí no se
 * recalculan. Lo demás pasa tal cual a las librerías.
 */
type FilaPedido = {
  id: number;
  numero: string;
  estado: string;
  tipo?: string;
  sc_id?: number | null;
  sc_numero?: string | null;
  cot_id?: number | null;
  cot_numero?: string | null;
  customer_name?: string | null;
  advisor_name?: string | null;
  total_cop?: number | string | null;
  anticipo_cop?: number | string | null;
  saldo_cop?: number | string | null;
  fecha_entrega_estimada?: string | null;
  pxp_id?: number | null;
  pxp_numero?: string | null;
  resolucion?: 'ATRASADO' | 'NO_RESUELTO' | 'ACCION_TOMADA' | 'CERRADO' | null;
  dias_sin_mov?: number | null;
  dias_creado?: number | null;
  seguimiento_estado?: string | null;
  [campo: string]: unknown;
};

/** `conteos` de con_conteos=1: las pestañas (con la búsqueda; sin vista, estados ni semáforo, R5). */
type ConteosPedidos = Partial<Record<'todos' | 'pend_compra' | 'en_proceso' | 'listo_entrega' | 'entregado' | 'facturado' | 'cancelado', number>>;
/** Lo que la lista lee de GET /ventas/stats?periodo=30d (T6C): los kpis de las tarjetas (RP19 (2), D5). */
type StatsPedidos = { kpis?: Record<string, unknown> | null };

/** El id de la lista: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26), y el del
 *  modo compacto de la franja (RP90). Exportado para el esqueleto del Suspense (CargandoPedidos). */
export const ID_PEDIDOS = 'ventas.pedidos';
/** R8 (atencion_primero_listas = «Sí; con un clic en una columna ordenas como quieras»): primero lo atrasado. */
export const INICIAL_PEDIDOS = { vista: 'todos', orden: 'atencion' };
/** El contenedor del Hub y de las otras listas (T7 a T9): pb-24 deja libre, con la página al fondo, la esquina del botón
 *  flotante de la IA; px-4 hasta xl: a 1024 px con el menú abierto las columnas clave caben (R26). El mismo en la
 *  pantalla y en su esqueleto del Suspense. */
// B4 T24 f2 (F44-a): la reserva del botón de la IA es el token RESERVA_BOTON_IA (pb-24) de design-system.ts.
export const CONTENEDOR_LISTA = `flex-1 flex flex-col px-4 xl:px-8 pt-6 ${RESERVA_BOTON_IA} max-w-[1600px] mx-auto w-full min-w-0 gap-6`;
/** R8: un pedido entregado, facturado o cancelado está cerrado y nunca va atrasado: desde ahí, «Con atraso» abre Todos. */
const VISTAS_SIN_ATRASO = ['entregado', 'facturado', 'cancelado'];
/** D39 (m6 de T8): en Kanban la lista va sin filas (limit=0): los conteos siguen al día en una consulta barata; las filas
 *  las piden las columnas del tablero. */
const EXTRA_TABLERO = { limit: 0 };

// Los chips: los tintes del tablero (CLASE_CHIP de components/ui/Kanban.tsx), el chip estándar de las tablas del B4 (m12
// de T8): la misma marca sale igual en Lista y en Kanban. Sin tamaño de letra: cada uso pone el suyo.
const CHIP = 'inline-block max-w-full truncate rounded-full border px-1.5 py-0.5 font-bold leading-tight';
const FOCO_VISIBLE = FOCOS.indigo;
// D41: el tono opaco filaAlerta para la fila atrasada (la resolución del servidor, R8) y la marca rosa a la izquierda del Hub.
const MARCA_ATRASO = '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-rose-500)]';
const claseDeFila = (p: FilaPedido) => (p.resolucion === 'ATRASADO' ? `${TABLE.filaAlerta} ${MARCA_ATRASO}` : null);

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
type AccionesFilaPedido = {
  abrir: (p: { id: number }) => void;
  ir: (ruta: string) => void;
  crearPxp: (p: FilaPedido) => void;
  creandoPxp: number | null;
  puedePxpRol: boolean;
};
const AccionesLista = createContext<AccionesFilaPedido | null>(null);

const tituloNumero = (p: FilaPedido) => [p.numero, p.sc_numero, p.cot_numero].filter(Boolean).join(' · ');

/** Pedido / Origen: el número y, debajo, la solicitud y la cotización de origen (como antes). */
function CeldaNumero({ p }: { p: FilaPedido }) {
  const origen = [p.sc_numero, p.cot_numero].filter(Boolean).join(' / ');
  return (
    <span className="flex min-w-0 flex-col items-start leading-tight">
      <span className="max-w-full truncate text-xs font-black text-indigo-700">{p.numero}</span>
      {origen && <span className="max-w-full truncate text-[10px] font-bold text-slate-500">{origen}</span>}
    </span>
  );
}

/**
 * Saldo (H47): «—» si el pedido no suma dinero (Cancelado o Devuelto); si no, el saldo, en rosa si queda algo por cobrar.
 * El dato es saldoVisiblePedido (listas-ventas.js), el mismo del chip «Saldo $X» de la tarjeta del tablero.
 */
function CeldaSaldo({ p }: { p: FilaPedido }) {
  const saldo = saldoVisiblePedido(p);
  if (saldo === null) return <span className="text-xs font-bold text-slate-400">—</span>;
  return <span className={`block truncate text-xs font-bold ${saldo > 0 ? 'text-rose-700' : 'text-slate-600'}`}>{fCOP(saldo)}</span>;
}

/**
 * Entrega est. (la lección de T9 r1, I2): fecha_entrega_estimada es una fecha de NEGOCIO: se pinta su día de calendario
 * (diaDeNegocio, el mismo del detalle y del editor) y alertaEntregaPedido la pone en rojo con el ícono si ya pasó o en
 * ámbar si vence en 7 días o menos, contra el día de hoy en Colombia; un pedido cerrado no lleva alerta.
 */
function CeldaEntrega({ p }: { p: FilaPedido }) {
  const alerta = alertaEntregaPedido(p);
  return (
    <span className={`text-xs font-bold ${alerta === 'vencida' ? 'text-red-600' : alerta === 'por_vencer' ? 'text-amber-700' : 'text-slate-600'}`}>
      {alerta === 'vencida' && <AlertCircle size={11} aria-hidden="true" className="mr-1 inline" />}
      {fechaCorta(diaDeNegocio(p.fecha_entrega_estimada)) || '-'}
    </span>
  );
}

/**
 * Estado: la insignia de estados-pedido.js (estadoDeTarjeta, la misma del tablero) y, debajo, los chips de la fila
 * (chipsDocumentoVentas, RP18): «Atrasado N días» y «Sin respuesta al recordatorio» (C14), los mismos de la tarjeta.
 */
function CeldaEstado({ p }: { p: FilaPedido }) {
  const e = estadoDeTarjeta('PVEN', p.estado);
  const chips = chipsDocumentoVentas(p, 'VEN');
  const clases = e.clases ? `${e.clases.bg} ${e.clases.text} ${e.clases.border}` : CLASE_CHIP.slate;
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      <span className={`${CHIP} text-[11px] ${clases}`}>{e.label}</span>
      {chips.length > 0 && (
        <span className="flex min-w-0 max-w-full flex-col items-start gap-0.5">
          {chips.map((c) => <span key={c.texto} className={`${CHIP} min-w-0 text-[10px] ${CLASE_CHIP[c.tono] ?? CLASE_CHIP.slate}`}>{c.texto}</span>)}
        </span>
      )}
    </span>
  );
}

const tituloEstado = (p: FilaPedido) =>
  [estadoDeTarjeta('PVEN', p.estado).label, ...chipsDocumentoVentas(p, 'VEN').map((c) => c.texto)].join(' · ');

/**
 * Acciones (H44, R8 y R11): el menú ⋯ de la fila (MenuFila), con «Ver detalle», «Crear PXP» (solo con el rol, sin
 * cancelar, con saldo y sin otra PXP vigente: H44+N6) y «Cancelar pedido» (solo si el servidor acepta cancelarlo: abre el
 * modal del detalle con ?accion=cancelar, N2). Son los de la lista de antes, en el menú único.
 */
function CeldaAcciones({ p }: { p: FilaPedido }) {
  const acciones = useContext(AccionesLista);
  const puedePxp = Boolean(acciones?.puedePxpRol) && pedidoAdmitePxp(p);
  const items: ItemMenuFila[] = [
    { etiqueta: 'Ver detalle', icono: FileCheck, onClick: () => acciones?.abrir(p) },
    { etiqueta: 'Crear PXP', icono: DollarSign, onClick: () => acciones?.crearPxp(p), oculto: !puedePxp,
      deshabilitado: acciones?.creandoPxp === p.id },
    { etiqueta: 'Cancelar pedido', icono: X, peligro: true, onClick: () => acciones?.ir(`/dashboard/ventas/venta/${p.id}?accion=cancelar`),
      oculto: !transicionesPedido(p.estado).includes('CANCELADO') },
  ];
  return (
    <span className="flex items-center justify-end">
      <MenuFila items={items} etiqueta={`Acciones de ${p.numero}`} />
    </span>
  );
}

/**
 * B4 T10, la tabla (TABLA-listas-ventas punto 7; R26, RP85, D41). Las columnas del diseño: la casilla (la selección de
 * B1), Pedido / Origen (clave, fija a la izquierda), Cliente (la flexible), Total, Anticipo y Entrega est. (ocultas por
 * defecto, R26: se muestran con «Ajustar tabla»), Saldo, Estado (clave) y Acciones (fija a la derecha). Constantes
 * (estables, D40); sus celdas piden a la pantalla lo suyo por AccionesLista. Exportadas para el esqueleto del Suspense.
 * R26 (medido en el banco de T10): a 1024 px con el menú abierto la caja de la tabla deja 704 px con su barra vertical.
 * Con Cliente en 152 (RP85) y Acciones en el mínimo de la tabla (64, ANCHO_MIN) las columnas sumaban 732 y la tabla corría
 * 28 px. r1 (m1): con Acciones en 56 su encabezado salía «Ac…» en todos los anchos; queda en 88, como en T9, y se lee
 * completo. Cliente baja a su piso de R26 (120) y Estado a 120 (como T8 y T9; recorta las mismas insignias que 128). Pedido
 * / Origen se queda en 132: el número del pedido mide 105 px (+ 24 de relleno) y en 120 se recortaba en todas las filas.
 * Lo que falta sale de los montos: Total 108 y Saldo 96 (caben hasta $99.999.999: 81 y 67 px medidos). 40 + 132 + 120 +
 * 108 + 96 + 120 + 88 = 704. Cliente es la flexible: toma lo que sobra en pantallas anchas.
 */
export const COLUMNAS_TABLA_PEDIDOS: ColumnaTabla<FilaPedido>[] = [
  { id: 'numero', titulo: 'Pedido / Origen', ancho: 132, clave: true, fija: 'izquierda', ordenable: 'numero', titleCelda: tituloNumero,
    celda: (p) => <CeldaNumero p={p} /> },
  { id: 'cliente', titulo: 'Cliente', ancho: 120, flexible: true, ordenable: 'cliente', titleCelda: (p) => p.customer_name || '-',
    celda: (p) => <span className="block truncate text-xs font-bold text-slate-800">{p.customer_name || '-'}</span> },
  { id: 'total', titulo: 'Total', ancho: 108, alinear: 'derecha', ordenable: 'total', titleCelda: (p) => fCOP(p.total_cop),
    celda: (p) => <span className="block truncate text-xs font-black text-slate-800">{fCOP(p.total_cop)}</span> },
  { id: 'anticipo', titulo: 'Anticipo', ancho: 104, alinear: 'derecha', ocultaPorDefecto: true, ordenable: 'anticipo',
    titleCelda: (p) => fCOP(p.anticipo_cop),
    celda: (p) => <span className="block truncate text-xs font-bold text-emerald-700">{fCOP(p.anticipo_cop)}</span> },
  { id: 'saldo', titulo: 'Saldo', ancho: 96, alinear: 'derecha', ordenable: 'saldo',
    titleCelda: (p) => { const s = saldoVisiblePedido(p); return s === null ? 'Sin saldo: el pedido no suma dinero (H47)' : fCOP(s); },
    celda: (p) => <CeldaSaldo p={p} /> },
  { id: 'entrega', titulo: 'Entrega est.', ancho: 104, ocultaPorDefecto: true, ordenable: 'entrega',
    titleCelda: (p) => fechaSolo(p.fecha_entrega_estimada) || 'Sin fecha de entrega', celda: (p) => <CeldaEntrega p={p} /> },
  { id: 'estado', titulo: 'Estado', ancho: 120, clave: true, ordenable: 'estado', titleCelda: tituloEstado,
    celda: (p) => <CeldaEstado p={p} /> },
  { id: 'acciones', titulo: 'Acciones', ancho: 88, clave: true, fija: 'derecha', celda: (p) => <CeldaAcciones p={p} /> },
];

/**
 * Las pestañas de la lista (TABLA-listas-ventas punto 7, RP21): las 7 vistas de GET /ventas/pedidos con sus conteos
 * (con_conteos: con la búsqueda, sin la vista, los estados ni el semáforo; null mientras cargan: la barra gris, nunca 0),
 * con los nombres de los pasos del pedido (grupoPedido). Se fue la pestaña Análisis (R13). Sin emojis. La misma en la
 * pantalla y en su esqueleto.
 */
export function pestanasDeLaLista(conteos: ConteosPedidos | null): PestanaTabla[] {
  return [
    { id: 'todos', etiqueta: 'Todos', conteo: conteos?.todos ?? null },
    { id: 'pend_compra', etiqueta: 'Pend. Compra', conteo: conteos?.pend_compra ?? null },
    { id: 'en_proceso', etiqueta: 'En Proceso', conteo: conteos?.en_proceso ?? null },
    { id: 'listo_entrega', etiqueta: 'Listo Entrega', conteo: conteos?.listo_entrega ?? null },
    { id: 'entregado', etiqueta: 'Entregado', conteo: conteos?.entregado ?? null },
    { id: 'facturado', etiqueta: 'Facturado', conteo: conteos?.facturado ?? null },
    { id: 'cancelado', etiqueta: 'Cancelado', conteo: conteos?.cancelado ?? null },
  ];
}

/**
 * Los botones de la cabecera: «Actualizar» y «Ver análisis» (R13: el Análisis del Hub enfocado en Pedidos,
 * ?tab=analisis&foco=pven, enlaceVerAnalisis). Un pedido solo nace de una cotización confirmada: no hay «Nuevo» (H47).
 * Los mismos en el esqueleto del Suspense, que los pinta invisibles para que la cabecera mida lo mismo.
 */
export function AccionesCabecera({ onActualizar, actualizando }: { onActualizar: () => void; actualizando: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button type="button" onClick={onActualizar} className={`bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm shadow-sm ${FOCO_VISIBLE}`}>
        <RefreshCw size={15} aria-hidden="true" className={actualizando ? 'animate-spin' : ''}/> Actualizar
      </button>
      <Link href={enlaceVerAnalisis('pven')}
        className={`bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-800 hover:border-indigo-200 flex items-center gap-2 text-sm shadow-sm ${FOCO_VISIBLE}`}>
        <ContenidoEnlace icon={BarChart3}>Ver análisis</ContenidoEnlace>
      </Link>
    </div>
  );
}


export default function VentaClient() {
  const router = useRouter();
  // H49 (T1B): avisos del sistema (nunca confirm, alert ni prompt). B4 T24 f2 (F47): confirmar() y avisarError() del tablero los usa
  // useAccionesTableroPedidos.
  const { avisar } = useAvisos();

  // ── B4 T10, bloque 1: la carga del servidor (TABLA-listas-ventas punto 7; R5, R8, C3, C4, C9; RP8, RP19, RP26, D5, D39, D40) ──
  // Ya no hay arreglos en memoria (antes, los 200 más recientes, filtrados, contados y sumados en el navegador). El estado
  // ÚNICO de la lista: las pestañas, la búsqueda, el filtro de estados, el semáforo y las cajas de la franja, las
  // tarjetas, la tabla y el tablero despachan a él. El modo (Lista o Kanban) se guarda en vista:ventas.pedidos (RP26:
  // este hook es su único dueño) y la pestaña, la página y la búsqueda en la sesión (volver del detalle deja lo mismo).
  const [estado, despachar, listo, modoListo] = useEstadoTabla(ID_PEDIDOS, INICIAL_PEDIDOS);
  // B4 T24 (FINAL-m31 y FINAL-m38): el rol después de montar (useRolActual) decide si el tablero se mueve (accesoTableroVentas: el
  // require_roles del PATCH de destino); sin permiso, soloLectura (no se arrastra ni se ofrece «Mover a…») y sin acciones masivas.
  // B4 T24 f2 (duda 3 de f1): el rol también va a la tarjeta del tablero de solo lectura (tarjetaDePedido, más abajo).
  const rol = useRolActual();
  const accesoTablero = accesoTableroVentas(rol);
  const enKanban = estado.modo === 'kanban';

  // La tabla (T6B): GET /ventas/pedidos con vista, estados, semáforo, q, orden, limit y offset del estado, más los conteos
  // de las pestañas en la MISMA llamada. esperar: !listo (D40): el esqueleto, nunca «vacío». En Kanban, sin filas
  // (EXTRA_TABLERO): las piden las columnas. Del resumen de H47 de esta respuesta solo se usa por_estado: los estados
  // heredados del filtro (r1 m5, r2 p1); las tarjetas leen /ventas/stats (D5) y cada columna del tablero trae el suyo (C9).
  // B4 T24 f2 (F2): en Lista, el filtro manda también los heredados equivalentes de lo marcado («Listo para entrega» lleva
  // LISTO_ENTREGA y LISTO_PARA_ENTREGA: una sola opción, estadosConsultaPedidos); sin nada que sumar, la consulta de siempre.
  const estadosConsulta = useMemo(() => estadosConsultaPedidos(estado.estados), [estado.estados]);
  const extraDeLaLista = useMemo(() => (estadosConsulta ? { estados: estadosConsulta } : null), [estadosConsulta]);
  const listado = useListado<FilaPedido>({
    ruta: '/ventas/pedidos', estado, conConteos: true, esperar: !listo, despachar,
    extra: enKanban ? EXTRA_TABLERO : extraDeLaLista,
  });
  // m5 de T8: mientras la última respuesta sea la de Kanban (sin filas) y la tabla ya pida su página, la tabla está
  // cargando y el total en 'cargando': nunca «No hay pedidos en esta vista» con el total de la otra consulta.
  const [llegada, setLlegada] = useState(() => llegadaDeListado(null, null, false));
  const llegadaAhora = llegadaDeListado(llegada, listado.crudo, enKanban);
  if (llegadaAhora !== llegada) setLlegada(llegadaAhora);
  const sinPagina = !enKanban && llegadaAhora.sinFilas && !listado.error;

  // La franja del flujo (R8): GET /ventas/flujo; recargaFlujo sube con cada recarga de la lista.
  const [recargaFlujo, setRecargaFlujo] = useState(0);
  const flujo = useResumenFlujo<DatosFlujo>('/ventas/flujo', recargaFlujo);

  // Las tarjetas (RP19 (2), D5): los kpis de GET /ventas/stats?periodo=30d (la llamada del Hub: «Saldo por cobrar» es el
  // mismo número, R7), sin respaldo local. Mientras no llega, 'cargando' (barras grises, nunca 0); si falla, «—».
  // B4 T24 f2 (F45): con useResumen (components/ui), el MISMO cargador del Hub (antes, una copia literal).
  const [vueltaStats, setVueltaStats] = useState(0);
  const stats = useResumen<StatsPedidos>(`/ventas/stats?periodo=${PERIODO_KPI}`, vueltaStats);
  const cargandoStats = stats.cargando;
  const estadoKpis = useEstadoKpi(cargandoStats, stats.error);

  // El tablero en modo servidor (R11, C4, D39): una consulta por columna (consultaColumnaPedido: vista=todos, los estados
  // de la columna cruzados con el filtro de la pantalla; sin ninguno en común la columna queda vacía sin pedir nada) con
  // el MISMO estado (búsqueda y semáforo; RP8: estados y q, nunca estado= ni search=); porColumna = el tamaño de la tabla
  // y limit=0 en las plegadas (lo hace el hook). 'atencion' en las abiertas y 'reciente' en Facturado y Cancelado (D39).
  const tablero = useTableroKanban<FilaPedido>({
    pantalla: ID_PEDIDOS,
    modo: 'servidor',
    columnas: COLUMNAS_PEDIDO,
    activo: listo && enKanban,
    porColumna: estado.tamano,
    dependencias: dependenciasTablero(estado),
    ordenDe: (c) => (c.cerrada ? 'reciente' : 'atencion'),
    cargar: async (columna, { offset, limit, orden, signal }) => {
      const consulta = consultaColumnaPedido(estado, columna, { orden, limit, offset });
      if (consulta === null) return { filas: [], total: 0 };
      return normalizarRespuesta(await apiFetch(`/ventas/pedidos?${consulta}`, { signal }));
    },
  });

  // «Actualizar»: la tabla, el tablero, la franja y las tarjetas. Ninguna recarga vacía lo que se ve: los hooks conservan
  // lo último. Después de un cambio de estado, lo que ese cambio mueve (las pestañas, la franja y las tarjetas); del
  // tablero, solo el origen y el destino (D39).
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarLista = useCallback(() => {
    recargarListado();
    recargarTablero();
    setRecargaFlujo((n) => n + 1);
    setVueltaStats((n) => n + 1);
  }, [recargarListado, recargarTablero]);
  const recargarTrasCambio = useCallback(() => {
    recargarListado();
    setRecargaFlujo((n) => n + 1);
    setVueltaStats((n) => n + 1);
  }, [recargarListado]);

  // D40 y D41: un solo usePreferenciasTabla por id (la tabla y «Ajustar tabla» comparten su resultado y el ref del ancho).
  const prefs = usePreferenciasTabla(ID_PEDIDOS, COLUMNAS_TABLA_PEDIDOS);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa: el conmutador sigue a la vista y el tablero no queda tapado.
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  // Las pestañas salen de la llamada de la lista: barras grises mientras cargan, «—» con error (C13).
  const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);

  const searchParams = useSearchParams();
  // Compatibilidad con enlaces antiguos que abrian el detalle con ?id=:
  // redirige a la pagina canonica en vez de duplicar la vista aqui.
  useEffect(()=>{
    const idParam = searchParams?.get('id');
    if(idParam){
      const numId = Number(idParam);
      if(!isNaN(numId)) router.replace(`/dashboard/ventas/venta/${numId}`);
    }
  },[searchParams, router]);

  // RP21: ?tab=<vista> (las cajas Entregado y Facturado de las otras listas: ?tab=entregado y ?tab=facturado) abre esa
  // pestaña, una sola vez al montar, como un clic en ella (accionPestana). Se lee con window.location en el efecto (sin
  // window en el render del servidor); un valor desconocido se ignora. Después se quita de la URL: recargar o volver con
  // el navegador no pisa la pestaña que el usuario elija después.
  // r1 (I1): el enlace hace lo mismo que elegirVista, también con Kanban guardado: abre esa pestaña en LISTA (el tablero
  // pide vista=todos: la pestaña no se vería). El modo guardado se conoce con `listo` (usePreferencia pinta primero el
  // valor por defecto), así que la vista se despacha al montar, antes de listo (useListado espera: la tabla se pide una
  // sola vez, ya con la pestaña del enlace), y queda anotada en enlacePendiente. Con listo, si el modo es Kanban,
  // accionVistaEnLista pasa a Lista con la poda de la Lista. Las dos refs se consumen una vez (StrictMode no repite el
  // enlace) y el segundo efecto es de layout: el tablero no llega a pintarse antes de pasar a Lista.
  // r1 (m5): las opciones del filtro de la Lista suman los estados heredados que traen los pedidos (resumen.por_estado,
  // H47; opcionesEstadosPedidos). Una sola función, estable mientras no cambia lo visto: la barra y la poda de las
  // pestañas, del conmutador, del semáforo y del enlace usan la misma. r2 (p1): el servidor calcula por_estado después
  // del filtro de estados, así que no se lee directo: porEstadoVisto guarda la unión de lo visto con la misma búsqueda y
  // semáforo (B4 T24 f2, F30: la pestaña ya no cuenta, y durante un viaje al servidor queda lo visto), solo de una respuesta
  // vigente (ni cargando, ni recargando, ni con error). Es un estado derivado
  // en el render, sin efectos (como llegadaDeListado): con la misma referencia no vuelve a pintar.
  const vigente = listado.cargandoInicial || listado.recargando || listado.error ? null : (listado.resumen?.por_estado ?? null);
  const [vistos, setVistos] = useState<PorEstadoVisto | null>(null);
  const vistosAhora = porEstadoVisto(vistos, estado, vigente);
  if (vistosAhora !== vistos) setVistos(vistosAhora);
  const porEstado = vistosAhora?.porEstado ?? null;
  const opcionesDeLaLista = useCallback(
    (vista: string | null) => opcionesEstadosPedidos(vista, porEstado), [porEstado],
  );
  const enlaceLeido = useRef(false);
  const enlacePendiente = useRef<string | null>(null);
  useEffect(() => {
    if (enlaceLeido.current) return;
    enlaceLeido.current = true;
    const vista = leerEnlacePedidos(window.location.search);
    if (!vista) return;
    enlacePendiente.current = vista;
    despachar(accionPestana(estado, vista, opcionesDeLaLista));
    router.replace(rutaSinParametro(RUTA_LISTA_PEDIDOS, window.location.search, 'tab'), { scroll: false });
  }, [estado, despachar, router, opcionesDeLaLista]);
  // B4 T24 (F38): con modoListo (el modo guardado leído de verdad), no con `listo`, que también llega por el tope de 4 s: si después
  // llegara 'kanban', la vista del enlace quedaría escondida en el tablero.
  useLayoutEffect(() => {
    const vista = enlacePendiente.current;
    if (!modoListo || vista === null) return;
    enlacePendiente.current = null;
    if (estado.modo === 'kanban') despachar(accionVistaEnLista(estado, vista, opcionesDeLaLista));
  }, [modoListo, estado, despachar, opcionesDeLaLista]);

  // ── B4 T10, bloque 2: pestañas y búsqueda (TABLA-listas-ventas punto 7; R5, RP21, RP26, D40, D41; H15, H17) ──
  const pestanas = pestanasDeLaLista(listado.conteos as ConteosPedidos | null);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    // m5 de T8: sin la página de la vista todavía (llegó la de Kanban), el total en 'cargando'.
    total: sinPagina ? null : listado.total,
    estadoTotal: estadoDelTotal({
      total: listado.total, cargando: listado.cargandoInicial || sinPagina, recargando: listado.recargando, error: listado.error,
    }),
  };
  // m2 de T8: el conmutador Lista / Kanban poda los estados con las opciones del modo nuevo (las columnas del tablero, o
  // las de la pestaña en Lista), con la regla de accionPestana (accionModo); lo demás de la barra va directo.
  const alCambiarBarra = useCallback((accion: AccionTabla) => {
    if (accion.tipo === 'modo') {
      const modo = String(accion.valor);
      despachar(accionModo(estado, modo, modo === 'kanban' ? OPCIONES_ESTADOS_TABLERO_PEDIDO : opcionesDeLaLista, COLUMNAS_PEDIDO));
    } else despachar(accion);
  }, [estado, despachar, opcionesDeLaLista]);
  // m8 de T8: el «vacío» de la lista solo cambia con la búsqueda. Sin búsqueda, de dónde salen los pedidos (H47).
  const vacioLista = useMemo(() => {
    const q = estado.q.trim();
    return (
      <div>
        <p className="font-semibold text-slate-600">{q ? `Sin resultados para «${q}»` : 'No hay pedidos de venta en esta vista'}</p>
        <p className="mt-1 text-xs text-slate-500">
          {q ? 'Ajusta la búsqueda o el filtro de estados.' : 'Los pedidos se crean al convertir una cotización confirmada por el cliente.'}
        </p>
      </div>
    );
  }, [estado.q]);

  // ── B4 T10, bloque 3: la tabla (las columnas son constantes del módulo; sus celdas piden lo suyo por AccionesLista) ──
  const abrirPedido = useCallback((p: { id: number }) => router.push(`/dashboard/ventas/venta/${p.id}`), [router]);
  // R8 / H44+N6: "Crear PXP" del menu de fila la crea de verdad (los montos salen del pedido en el servidor).
  const [creandoPxp, setCreandoPxp] = useState<number | null>(null);
  const crearPxp = useCallback(async (p: FilaPedido) => {
    setCreandoPxp(p.id);
    try {
      const r = await apiFetch(`/ventas/pedidos/${p.id}/crear-pxp`, { method: 'POST', body: JSON.stringify({}) });
      avisar(`Orden de pago ${r?.data?.numero || ''} creada para ${p.numero}`, { tono: 'ok' });
      recargarListado();
    } catch (err) {
      // Los de error pasan por textoDeError (sin conexión, '[object Object]', 'Error: ' repetido).
      avisar(textoDeError(err), { tono: 'error' });
      // La regla única (recargarTrasError): un 400, un 409, un 422 (F8) o la red cortada recargan la lista; un 403 o un 500, no.
      if (recargarTrasError(err)) recargarListado();
    } finally {
      setCreandoPxp(null);
    }
  }, [avisar, recargarListado]);
  const puedePxpRol = puedeCrearOrdenDePago(getUsuarioActual().role);
  const accionesFila = useMemo<AccionesFilaPedido>(() => ({
    abrir: abrirPedido, ir: (ruta) => router.push(ruta), crearPxp, creandoPxp, puedePxpRol,
  }), [abrirPedido, router, crearPxp, creandoPxp, puedePxpRol]);
  // La selección de las filas (la de B1): «Seleccionar todo» marca la página; TablaEstandar la limpia al cambiar de
  // página, pestaña, búsqueda, filtro u orden.
  const [seleccion, setSeleccion] = useState<ClaveFila[]>([]);
  const alSeleccionar = useCallback((claves: ClaveFila[]) => setSeleccion(claves), []);
  const pieSeleccion = seleccion.length > 0
    ? <span className="font-bold text-indigo-700">{seleccion.length} {seleccion.length === 1 ? 'seleccionado' : 'seleccionados'}</span>
    : null;

  // ── B4 T10, bloque 4: el tablero (KANBAN-ventas-listas punto 5; C15, R11; D37, D39) ──
  // reglaSoltarPedido (T3C): libre entre Pendiente de compra, En proceso y Listo para entrega; a Entregado no se arrastra
  // (Entregas elige la bodega); Facturado solo desde Entregado, con confirmación; Cancelado pide el motivo; un pedido
  // entregado o cancelado no vuelve atrás. Lo que no se puede queda bloqueado con su motivo ANTES de soltar.
  // B4 T24 f2 (F47): lo que pasa al soltar ('cambio', 'facturar' y 'cancelar') y «Marcar En tránsito / En proceso» del ⋯ son las
  // MISMAS acciones de E-Commerce: useAccionesTableroPedidos (la regla de error y de recarga, en accionesTableroPedidos de
  // lib/kanban-ventas.js, con sus casos). Solo quien mueve (accesoTablero.mover) ve las acciones del ⋯.
  const {
    cambiarDesdeTablero, accionDesdeTablero, accionesTarjeta, cancelando, cancelarConMotivo, cerrarCancelacion,
  } = useAccionesTableroPedidos<FilaPedido>({ tablero, recargarTrasCambio, mover: accesoTablero.mover });
  // La tarjeta del tablero (KANBAN-ventas-listas punto 5, D37 y el cruce C5): vuelve a esta lista. B4 T24 f2 (duda 3 de f1): en solo
  // lectura, su acción principal queda solo si el rol puede hacerla (FINANZAS cobra, COMPRAS gestiona la compra, BODEGA despacha); si
  // no, la tarjeta queda en «Abrir», como en E-Commerce (tarjetaPedido con rolSoloLectura).
  const tarjetaDePedido = useCallback(
    (p: FilaPedido) => tarjetaPedido(p, { rolSoloLectura: accesoTablero.soloLectura ? rol : null }),
    [accesoTablero.soloLectura, rol],
  );
  // C9: la suma de H47 de cada columna (el resumen de su consulta) debajo del título, salvo en Cancelado.
  const resumenColumna = useCallback(
    (clave: string, d: DatosColumnaKanban<FilaPedido>) => resumenColumnaPedido(clave, d.resumen), [],
  );

  // ── B4 T10, bloque 5: las tarjetas (KPI-ventas punto 9; R12, RP19 (2), D5) ──
  const tarjetas = tarjetasPedidos(stats.datos?.kpis ?? null);
  // En Lista son pestañas (D41: accionPestana, como un clic en la pestaña); tocar la activa vuelve a Todos (la de siempre,
  // alternarPaso). En Kanban abren esa pestaña en Lista (accionVistaEnLista, la misma acción del enlace ?tab=). El
  // monto vendido y el saldo no tienen una vista: no son botones.
  const vistaActiva = enKanban ? null : estado.vista;
  const elegirVista = (vista: string) => {
    const siguiente = enKanban ? vista : (alternarPaso(estado.vista, vista) ?? INICIAL_PEDIDOS.vista);
    despachar(accionVistaEnLista(estado, siguiente, opcionesDeLaLista));
  };

  // ── B4 T10, bloque 6: la franja del flujo (FLUJO-ventas-pantallas D; R8, C3, D42, RP21, RP90) ──
  // «Estás aquí» en Pedido de venta, con su detalle agrupado con grupoPedido; Entregado y Facturado son de esta misma
  // página: un clic abre su pestaña (y otro, vuelve a Todos), como las tarjetas; Solicitud y Cotización llevan a su lista.
  const pasosFlujo = useMemo(() => pasosDePedidos(flujo.datos, vistaActiva), [flujo.datos, vistaActiva]);
  const atrasadosPVEN = pasosFlujo.find((p) => p.esEste)?.atrasados ?? null;
  const filtroSemaforo: FiltroSemaforo = estado.semaforo === 'atrasados' ? 'atrasados' : 'todos';
  // «Con atraso» pone semaforo=atrasados en el estado único (la tabla y el tablero lo mandan al servidor) y vuelve a la
  // página 1; «Ver todo» lo quita. Entregado, Facturado y Cancelado nunca van atrasados: desde ahí abre Todos, también en
  // Kanban (r2b de T8), con la poda de las opciones del modo que se ve.
  const alFiltrarSemaforo = (f: FiltroSemaforo) => {
    if (f !== 'todos' && VISTAS_SIN_ATRASO.includes(estado.vista ?? '')) {
      despachar(accionPestana(estado, INICIAL_PEDIDOS.vista, enKanban ? OPCIONES_ESTADOS_TABLERO_PEDIDO : opcionesDeLaLista));
    }
    despachar({ tipo: 'semaforo', valor: f === 'todos' ? null : f });
  };
  const alSeleccionarPaso = (clave: string) => {
    const vista = vistaDePasoPedido(clave);
    if (vista) elegirVista(vista);
  };
  const actualizando = listado.recargando || flujo.cargando || (cargandoStats && stats.datos !== null);

  return (
    <div className="w-full bg-slate-50 min-h-full flex flex-col">
      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/venta" color="indigo" hub={{ href: '/dashboard/ventas' }} />

      {/* B4 T10 (FLUJO-ventas-pantallas D; R8, D42, RP21, RP90): la franja del flujo, con «Estás aquí» en Pedido de venta y
          su detalle agrupado con grupoPedido. «Con atraso» es semaforo=atrasados en el servidor, con los atrasados del
          paso Pedido de venta; no hay «No resueltos» (la clave noResueltos no se escribe). Entregado y Facturado abren su
          pestaña (onSeleccionarPaso); Solicitud y Cotización llevan a su lista. Va directo bajo la barra de submódulos,
          sin otro padding horizontal. */}
      <BannerFlujo
        titulo="Flujo comercial"
        idPreferencia={ID_PEDIDOS}
        regla={textoRegla(flujo.datos?.dias_alerta)}
        semaforo={{ atrasados: atrasadosPVEN, filtro: filtroSemaforo, onFiltrar: alFiltrarSemaforo }}
        pasos={pasosFlujo}
        cargando={flujo.cargando}
        error={flujo.error}
        onReintentar={flujo.recargar}
        onSeleccionarPaso={alSeleccionarPaso}
      />

      {/* B4 T10: el contenedor del Hub y de las otras listas (CONTENEDOR_LISTA). */}
      <div className={CONTENEDOR_LISTA}>
        {/* Header. H47: el subtítulo de siempre, una frase corta sin códigos (FLUJO-ventas-pantallas D.4). R13
            (ANALISIS-ventas punto 7): «Ver análisis» abre el Análisis del Hub enfocado en Pedidos (?tab=analisis&foco=pven).
            Un pedido solo nace de una cotizacion confirmada (no hay "Nuevo Pedido"). */}
        <PageHeader
          icon={ShoppingCart} color="indigo"
          title="Pedidos de Venta"
          subtitle="Pedidos confirmados por tus clientes"
          actions={<AccionesCabecera onActualizar={recargarLista} actualizando={actualizando} />}
        />

        {/* B4 T10 (KPI-ventas punto 9; R12, RP19 (2), D5): las 4 tarjetas con los kpis de /ventas/stats (todos los pedidos):
            mientras cargan, barras grises (nunca 0); con error, «—». El total y Pendientes de compra son sus pestañas
            (accionPestana; tocar la activa vuelve a Todos); el monto vendido y el saldo no tienen una vista. «Saldo por
            cobrar» es el del Hub (R7: una foto de hoy, sin %). */}
        <FranjaKpis estado={estadoKpis} titulo="Pedidos de venta">
          <TarjetaKpi kpi="pven_total" valor={tarjetas?.total.valor ?? null} ayuda={tarjetas?.total.ayuda ?? undefined}
            activo={vistaActiva === 'todos'} onClick={() => elegirVista('todos')} />
          <TarjetaKpi kpi="pven_monto_vendido" valor={tarjetas?.monto_vendido.valor ?? null} ayuda={tarjetas?.monto_vendido.ayuda ?? undefined} />
          <TarjetaKpi kpi="pven_pendiente_compra" valor={tarjetas?.pendiente_compra.valor ?? null} ayuda={tarjetas?.pendiente_compra.ayuda ?? undefined}
            activo={vistaActiva === 'pend_compra'} onClick={() => elegirVista('pend_compra')} />
          <TarjetaKpi kpi="pven_saldo_por_cobrar" valor={tarjetas?.saldo_por_cobrar.valor ?? null} ayuda={tarjetas?.saldo_por_cobrar.ayuda ?? undefined}
            variacion={{ actual: tarjetas?.saldo_por_cobrar.valor ?? null, anterior: null, es_foto: true }} />
        </FranjaKpis>

        {/* B4 T10 (TABLA-listas-ventas punto 7, KANBAN-ventas-listas punto 5): la barra y la tabla estándar, o el tablero
            en modo servidor, con el MISMO estado (búsqueda, estados y semáforo). Se fue la pestaña Análisis (R13): ya no
            se pinta la tabla vacía debajo. */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <AccionesLista.Provider value={accionesFila}>
            <section ref={refTarjeta} className={claseTarjeta}>
              {/* Las pestañas con los conteos del servidor (en Kanban no se pintan: el tablero muestra todas); la búsqueda
                  va al servidor (número, cliente, asesor, la SC, la COT y el producto, T6B); «Filtrar Estado» (H15) es
                  FiltroEstados con las etiquetas de estados-pedido.js y solo los de la pestaña; el conmutador que R8 ocultó
                  vuelve como ConmutadorVista (kanbanDisponible). */}
              <BarraTabla
                estado={estado}
                onEstado={alCambiarBarra}
                pestanas={enKanban ? undefined : pestanas}
                estadoConteos={estadoConteos}
                placeholder="Buscar por número, cliente, asesor, solicitud, cotización o producto…"
                opcionesEstados={enKanban ? OPCIONES_ESTADOS_TABLERO_PEDIDO : opcionesDeLaLista}
                ajustes={{ columnas: COLUMNAS_TABLA_PEDIDOS, preferencias: prefs, anchoRef: anchoTablaRef }}
                kanbanDisponible
                pantallaCompleta={enKanban ? undefined : { completa, alternar }}
                {...totalDeLaBarra}
              />
              {/* B4 T10, la tabla estándar en el servidor (TABLA-listas-ventas punto 7; R26, D41): la paginación, el
                  tamaño (25 o 50), el orden y la selección son de la tabla (se fueron la paginación propia y el ⋯ hecho a
                  mano); N9: la vuelta a la página 1 la hace useEstadoTabla. La fila atrasada en filaAlerta; un clic en la
                  fila abre el pedido. */}
              {!enKanban && (
                <TablaEstandar
                  id={ID_PEDIDOS}
                  modo="servidor"
                  columnas={COLUMNAS_TABLA_PEDIDOS}
                  preferencias={prefs}
                  anchoRef={anchoTablaRef}
                  estado={estado}
                  onEstado={despachar}
                  filas={listado.filas}
                  total={sinPagina ? null : listado.total}
                  cargando={listado.cargandoInicial || sinPagina}
                  recargando={listado.recargando}
                  error={listado.error}
                  onReintentar={listado.recargar}
                  aviso={listado.avisoOrden}
                  onFila={abrirPedido}
                  claseFila={claseDeFila}
                  vacio={vacioLista}
                  seleccion={seleccion}
                  onSeleccion={alSeleccionar}
                  pie={pieSeleccion}
                  etiqueta="Pedidos de venta"
                />
              )}
            </section>
          </AccionesLista.Provider>
          {/* B4 T10, el tablero (KANBAN-ventas-listas punto 5): Pendiente de compra · En proceso · Listo para entrega ·
              Entregado · Facturado (plegada) · Cancelado (plegada), con la suma de cada columna. Lo que no se puede queda
              bloqueado con su motivo ANTES de soltar (reglaSoltarPedido). */}
          {enKanban && (
            // B4 T24 r2 (m2, m10): mientras se lee el rol, el esqueleto (sin acciones) en lugar del tablero.
            !accesoTablero.listo ? <EsqueletoTablero /> : <TableroKanban
              tablero={tablero}
              regla={reglaSoltarPedido}
              tarjetaDe={tarjetaDePedido}
              onAbrir={abrirPedido}
              onCambio={cambiarDesdeTablero}
              onAccion={accionDesdeTablero}
              accionesTarjeta={accionesTarjeta}
              resumenColumna={resumenColumna}
              soloLectura={accesoTablero.soloLectura}
              color="indigo"
            />
          )}
        </div>
      </div>

      {/* B4 T10 (KANBAN-ventas-listas punto 5; N2, H45, H46): el motivo de la cancelación desde el tablero (ModalMotivo,
          nunca prompt), con lo mismo que dice el modal del detalle (efectosCancelarPedido). */}
      {cancelando && (
        <ModalMotivo
          titulo={`Cancelar ${cancelando.pedido.numero}`}
          efectos={efectosCancelarPedido(cancelando.pedido)}
          textoConfirmar="Cancelar pedido"
          placeholder="Ej: Cliente desistió de la compra, error en el pedido, etc."
          onConfirmar={cancelarConMotivo}
          onCerrar={cerrarCancelacion}
        />
      )}
    </div>
  );
}


