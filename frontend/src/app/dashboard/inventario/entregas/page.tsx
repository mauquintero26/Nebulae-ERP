'use client';

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpFromLine, Eye, MessageCircle, Package, RefreshCw, Truck } from 'lucide-react';
// B4 T19: Entregas (Cola de Despacho) 100 % sobre el servidor (R5, R15, C3, C4, C19). Las pestañas SON las columnas del tablero
// (lib/entregas.js: Esperando mercancía · Listo pero falta saldo · Listo para despachar · Despachados, servidas con estados + saldo de
// /ventas/pedidos), el tablero va en modo servidor con reglaSoltarEntrega y los cancelados y devueltos no aparecen en ninguna. El
// despacho abre el Drawer con el selector de bodega y confirma con useAvisos (antes window.confirm); también lo hace el rol Bodega
// (RP23: manda exactamente {estado, warehouse_id}). Las tarjetas son pven_en_curso, ent_saldo y ent_despachados (esta última es el
// conteo de su pestaña); donde decía «Protocolo 60/40» hay una nota. Se conserva lo de B1 a B3: el Drawer, el WhatsApp de lib/whatsapp.js
// y «Marcar Saldo Cobrado» (su PATCH no se toca).
import {
  SubNav, PageHeader, Drawer, Button, MenuFila, useAvisos, FranjaKpis, TarjetaKpi, useEstadoKpi, TableroKanban, useTableroKanban,
} from '@/components/ui';
import { useResumen } from '@/components/ui/useResumen';
import type { ItemMenuFila } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { AccionTabla, ColumnaTabla } from '@/components/tabla';
import { INV_NAV } from '../inv-nav';
import { AvisoReintentar, CONTENEDOR, FOCOS, pesos, useCatalogo } from '../piezas-inventario';
import { CHIP, titulosDeOrdenPec } from '../../compras/columnas-pec';
import { useRolActual } from '@/components/ui/useRolActual';

import { apiFetch } from '@/lib/api';
import {
  accionModo, accionVistaEnLista, dependenciasTablero, estadoDelTotal, normalizarRespuesta, ordenEsAtencion, textoOrdenHub,
} from '@/lib/tabla';
import { lecturaDeCarga } from '@/lib/kpis';
import { recargarTrasError } from '@/lib/avisos';
import { infoEstadoPedido } from '@/lib/estados-pedido';
import { abrirWhatsApp, waUrl } from '@/lib/whatsapp';
import {
  COLUMNAS_ENTREGA, NOTA_ENTREGAS, OPCIONES_ESTADOS_TABLERO_ENTREGA, VISTA_DE_TRABAJO_ENTREGA, confirmacionDespacho,
  consultaColumnaEntrega, consultaConteoEntrega, consultaEntregas, cuerpoDespacho, infoCobroEntrega, mensajeFaltaBodega, opcionesEstadosEntrega,
  pestanasEntrega, puedeCobrarSaldo, puedeDespacharPedido, recordatorioSaldo, reglaSoltarEntrega, resumenColumnaEntrega, saldoEntrega,
  tarjetaEntrega, tarjetasEntregas, textoEntregaTablero, textoFaltaSaldo, textoVacioEntregas, vistaDeTarjetaEntrega,
} from '@/lib/entregas';

/** Una línea del pedido (productos de _ven_dict: JSON; los nombres son los del servidor). */
type LineaPedido = { product_name?: string | null; sku_id?: number | null; qty?: number | null; unit_price_cop?: number | null };
/** Una fila de GET /ventas/pedidos (_ven_dict, T6B): los nombres son los del servidor. */
type FilaPedido = {
  id: number;
  numero?: string | null;
  cot_numero?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  telefono_whatsapp?: string | null;
  direccion_entrega?: string | null;
  customer_address?: string | null;
  estado: string;
  total_cop?: number | null;
  anticipo_cop?: number | null;
  saldo_cop?: number | null;
  notas?: string | null;
  fecha_entrega_estimada?: string | null;
  productos?: LineaPedido[] | null;
};
type ClaveColumna = 'esperando' | 'falta_saldo' | 'listo' | 'despachado';

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_ENTREGAS = 'inventario.entregas';
/** La pestaña de trabajo: Listo para despachar. */
const INICIAL_ENTREGAS = { vista: VISTA_DE_TRABAJO_ENTREGA };
const RUTA_PEDIDOS = '/ventas/pedidos';

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
const AccionesFila = React.createContext<{ abrir: (p: FilaPedido) => void; rol: string } | null>(null);

/** Estado: la insignia de estados-pedido.js (nunca el código crudo). */
function CeldaEstado({ p }: { p: FilaPedido }) {
  const { label, clases } = infoEstadoPedido(p.estado);
  return <span className={`${CHIP} text-[11px] ${clases.bg} ${clases.text} ${clases.border}`}>{label}</span>;
}
/** Cobro: «Cobro pendiente» (ámbar) o «Pagado» (verde). */
function CeldaCobro({ p }: { p: FilaPedido }) {
  const { label, clases } = infoCobroEntrega(p);
  return <span className={`${CHIP} text-[11px] ${clases.bg} ${clases.text} ${clases.border}`}>{label}</span>;
}
/** Acciones (R11): «Ver», «Despachar» (solo en Listo para despachar y a quien despacha) y el menú ⋯. Todo lleva el número del pedido. */
function CeldaAcciones({ p }: { p: FilaPedido }) {
  const acciones = useContext(AccionesFila);
  const numero = p.numero ?? `#${p.id}`;
  const puede = acciones ? puedeDespacharPedido(p, acciones.rol) : false;
  const recordatorio = recordatorioSaldo(p);
  const items: ItemMenuFila[] = [
    { etiqueta: 'Ver detalle', icono: Eye, onClick: () => acciones?.abrir(p) },
    { etiqueta: 'Despachar', icono: Truck, onClick: () => acciones?.abrir(p), oculto: !puede },
    { etiqueta: 'Recordar el saldo por WhatsApp', icono: MessageCircle, onClick: () => { if (recordatorio) abrirWhatsApp(recordatorio.url); }, oculto: !recordatorio },
  ];
  return (
    <span className="flex items-center justify-end gap-0.5">
      <button type="button" onClick={() => acciones?.abrir(p)} aria-label={`Ver el pedido ${numero}`} title="Ver"
        className={`rounded-lg p-1.5 text-rose-700 transition-colors hover:bg-rose-50 ${FOCOS.indigo}`}>
        <Eye size={14} aria-hidden="true" />
      </button>
      {recordatorio && (
        <button type="button" onClick={() => abrirWhatsApp(recordatorio.url)} aria-label={`Recordar el saldo de ${numero} por WhatsApp`} title="Recordar el saldo por WhatsApp"
          className={`rounded-lg p-1.5 text-emerald-800 transition-colors hover:bg-emerald-50 ${FOCOS.indigo}`}>
          <MessageCircle size={14} aria-hidden="true" />
        </button>
      )}
      {puede && (
        <button type="button" onClick={() => acciones?.abrir(p)} aria-label={`Despachar el pedido ${numero}`} title="Despachar"
          className={`rounded-lg p-1.5 text-emerald-700 transition-colors hover:bg-emerald-50 ${FOCOS.indigo}`}>
          <Truck size={14} aria-hidden="true" />
        </button>
      )}
      <MenuFila items={items} etiqueta={`Acciones de ${numero}`} />
    </span>
  );
}

/**
 * B4 T19, la tabla (TABLA-inventario punto 10; R26, D41): Pedido # (clave, fija a la izquierda), Cliente (la flexible), Ítems, Total,
 * Saldo, Cobro, Estado (clave), Entrega est. y Acciones (clave, fija a la derecha). A 1024 px con el menú abierto la caja de la tabla
 * deja 704 px, sin casilla de selección: Pedido # 112 + Cliente 120 (su piso de R26) + Total 100 + Saldo 100 + Estado 124 + Acciones
 * 112 = 668. Ítems, Cobro y Entrega est. van ocultas por defecto (se muestran con «Ajustar tabla»). El servidor ordena por número,
 * cliente, total, saldo, estado y entrega (GET /ventas/pedidos). Una constante: estable (D40).
 */
const COLUMNAS_TABLA_ENTREGAS: ColumnaTabla<FilaPedido>[] = [
  { id: 'numero', titulo: 'Pedido #', ancho: 112, clave: true, fija: 'izquierda', ordenable: 'numero', titleCelda: (p) => p.numero ?? `#${p.id}`,
    celda: (p) => (
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-xs font-black text-rose-700">{p.numero ?? `#${p.id}`}</span>
        {p.cot_numero && <span className="truncate text-[10px] text-slate-500">de {p.cot_numero}</span>}
      </span>
    ) },
  { id: 'cliente', titulo: 'Cliente', ancho: 120, flexible: true, ordenable: 'cliente', titleCelda: (p) => p.customer_name || 'Cliente sin nombre',
    celda: (p) => (
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-xs font-bold text-slate-800">{p.customer_name || 'Cliente sin nombre'}</span>
        {p.customer_phone && <span className="truncate font-mono text-[10px] text-slate-500">{p.customer_phone}</span>}
      </span>
    ) },
  { id: 'items', titulo: 'Ítems', ancho: 64, alinear: 'centro', ocultaPorDefecto: true,
    celda: (p) => <span className="text-xs font-semibold text-slate-700">{(p.productos ?? []).length || '—'}</span> },
  { id: 'total', titulo: 'Total', ancho: 100, alinear: 'derecha', ordenable: 'total', titleCelda: (p) => pesos(p.total_cop),
    celda: (p) => <span className="text-xs font-bold text-slate-800">{pesos(p.total_cop)}</span> },
  { id: 'saldo', titulo: 'Saldo', ancho: 100, alinear: 'derecha', ordenable: 'saldo', titleCelda: (p) => pesos(saldoEntrega(p)),
    celda: (p) => <span className={`text-xs font-black ${saldoEntrega(p) > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{pesos(saldoEntrega(p))}</span> },
  { id: 'cobro', titulo: 'Cobro', ancho: 116, ocultaPorDefecto: true, celda: (p) => <CeldaCobro p={p} /> },
  { id: 'estado', titulo: 'Estado', ancho: 124, clave: true, ordenable: 'estado', titleCelda: (p) => infoEstadoPedido(p.estado).label, celda: (p) => <CeldaEstado p={p} /> },
  { id: 'entrega', titulo: 'Entrega est.', ancho: 100, ocultaPorDefecto: true, ordenable: 'entrega',
    titleCelda: (p) => textoEntregaTablero(p),
    celda: (p) => <span className="text-xs text-slate-600">{textoEntregaTablero(p)}</span> },
  { id: 'acciones', titulo: 'Acciones', ancho: 112, clave: true, fija: 'derecha', celda: (p) => <CeldaAcciones p={p} /> },
];
/** {campo de orden: título}, para el chip «Orden: Total ↓», solo de las columnas que se ordenan. */
const TITULOS_ORDEN_ENTREGAS = titulosDeOrdenPec(COLUMNAS_TABLA_ENTREGAS);

type ConteosCargados = { vuelta: string; conteos: Record<ClaveColumna, number> | null; error: unknown };

/* ================================================================
   MAIN PAGE — EntregasPage (B4 T19)
   ================================================================ */
export default function EntregasPage() {
  const { avisar, avisarError, confirmar } = useAvisos();
  // El rol que despacha: ADMIN, ASESOR y BODEGA (R15); los demás roles solo ven (reglaSoltarEntrega los deja en «solo ver»).
  // m14: el rol se lee DESPUÉS de montar (B4 T24, F46: useRolActual, la pieza común; '' en el servidor y en la hidratación); sin rol no
  // se pintan los botones que dependen de él.
  const rol = useRolActual();

  // ── bloque 1: la carga del servidor (TABLA-inventario punto 10; R5, C3, C4, C19; D39, D40) ──
  // El estado ÚNICO de la pantalla: las pestañas (= las columnas), la búsqueda, el filtro de estados, la tarjeta, la tabla y el tablero
  // despachan a él. El modo (Lista o Kanban) se guarda en vista:inventario.entregas.
  const [estado, despachar, listo] = useEstadoTabla(ID_ENTREGAS, INICIAL_ENTREGAS);
  const enKanban = estado.modo === 'kanban';
  const [selected, setSelected] = useState<FilaPedido | null>(null);
  // De dónde vino el despacho si se soltó una tarjeta (para recargar SOLO esas dos columnas, D39).
  const [desdeTablero, setDesdeTablero] = useState<{ origen: string; destino: string } | null>(null);

  // La tabla: la página (25 o 50) de GET /ventas/pedidos con los `estados` y el `saldo` de la pestaña (consultaEntregas).
  // esperar: !listo (D40): el esqueleto, nunca «vacío». En Kanban no pide la lista (activo: false, RP35).
  const extraDeLaLista = useMemo(() => consultaEntregas(estado), [estado]);
  const listado = useListado<FilaPedido>({
    ruta: RUTA_PEDIDOS, estado, esperar: !listo, despachar, activo: !enKanban, extra: extraDeLaLista,
  });

  // El tablero en modo servidor (R11, C4, D39): una consulta por columna (consultaColumnaEntrega), porColumna = el tamaño de la tabla
  // y limit=0 en las plegadas (lo hace el hook). 'atencion' en las abiertas y 'reciente' en Despachados. La respuesta trae el `resumen`.
  const tablero = useTableroKanban<FilaPedido>({
    pantalla: ID_ENTREGAS,
    modo: 'servidor',
    columnas: COLUMNAS_ENTREGA,
    activo: listo && enKanban,
    porColumna: estado.tamano,
    dependencias: dependenciasTablero(estado),
    ordenDe: (c) => (c.cerrada ? 'reciente' : 'atencion'),
    cargar: async (columna, { offset, limit, orden, signal }) => {
      const consulta = consultaColumnaEntrega(estado, columna, { orden, limit, offset });
      if (consulta === null) return { filas: [], total: 0 };
      return normalizarRespuesta(await apiFetch(`${RUTA_PEDIDOS}?${consulta}`, { signal }));
    },
  });

  // Los conteos de las pestañas (consultaConteoEntrega: estados + saldo con la BÚSQUEDA del estado, limit=0; R5). La tarjeta Despachados
  // lee el MISMO número que su pestaña. La primera carga va en 'cargando' (nunca 0); una recarga o una búsqueda nueva conserva el último
  // valor atenuado ('actualizando', I3); si fallan, «—» y «Reintentar».
  const [vueltaConteos, setVueltaConteos] = useState(0);
  const [cargadosConteos, setCargadosConteos] = useState<ConteosCargados | null>(null);
  const qConteos = estado.q.trim();
  const claveConteos = `${vueltaConteos}|${qConteos}`;
  useEffect(() => {
    const control = new AbortController();
    const total = async (clave: ClaveColumna) => {
      const columna = COLUMNAS_ENTREGA.find((c) => c.clave === clave)!;
      return normalizarRespuesta(await apiFetch(`${RUTA_PEDIDOS}?${consultaConteoEntrega(columna, { q: qConteos })}`, { signal: control.signal })).total;
    };
    Promise.all([total('esperando'), total('falta_saldo'), total('listo'), total('despachado')])
      .then(([esperando, falta_saldo, listoN, despachado]) => setCargadosConteos({
        vuelta: claveConteos, conteos: { esperando, falta_saldo, listo: listoN, despachado }, error: null,
      }))
      .catch((err: unknown) => { if (!control.signal.aborted) setCargadosConteos({ vuelta: claveConteos, conteos: null, error: err }); });
    return () => control.abort();
  }, [claveConteos, qConteos]);
  const { datos: conteos, cargando: cargandoConteos } = lecturaDeCarga(
    cargadosConteos && { vuelta: cargadosConteos.vuelta, datos: cargadosConteos.conteos, error: cargadosConteos.error }, claveConteos);
  const errorConteos = cargandoConteos ? null : (cargadosConteos?.error ?? null);
  const estadoConteos = useEstadoKpi(cargandoConteos, errorConteos);

  // Las tarjetas «Pedidos en curso» y «Saldo antes de despachar» (KPI-inventario punto 8): GET /ventas/stats, sin respaldo local.
  // B4 T24 f3 (F45): el cargador compartido (useResumen: conserva lo último al recargar y con error no deja datos viejos).
  const [vueltaStats, setVueltaStats] = useState(0);
  const stats = useResumen<{ kpis?: unknown }>('/ventas/stats', vueltaStats);
  const kpisStats = stats.datos?.kpis ?? null;
  const { cargando: cargandoStats, error: errorStats } = stats;
  const estadoStats = useEstadoKpi(cargandoStats, errorStats);
  const tarjetas = tarjetasEntregas(kpisStats, conteos);

  // Las bodegas del despacho (GET /inventory/warehouses): con error, se dice con «Reintentar»; nunca una lista vacía falsa.
  const { catalogo: bodegas, recargar: recargarBodegas } = useCatalogo('/inventory/warehouses');
  const [bodegaElegida, setBodegaElegida] = useState('');
  // Con una sola bodega, queda elegida (como hoy).
  const warehouseId = bodegaElegida || (bodegas.filas?.length === 1 ? String(bodegas.filas[0].id) : '');
  const nombreBodega = bodegas.filas?.find((b) => String(b.id) === warehouseId)?.name ?? null;

  // «Actualizar» y lo que sigue a un cambio de datos: la lista, el tablero, las pestañas y las tarjetas. Ninguna recarga vacía lo que se ve.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarTodo = useCallback((columnas?: ReadonlyArray<string>) => {
    recargarListado();
    recargarTablero(columnas);
    setVueltaConteos((n) => n + 1);
    setVueltaStats((n) => n + 1);
  }, [recargarListado, recargarTablero, setVueltaConteos, setVueltaStats]);

  const abrir = useCallback((p: FilaPedido) => { setDesdeTablero(null); setSelected(p); }, []);
  const accionesFila = useMemo(() => ({ abrir, rol }), [abrir, rol]);

  // ── el despacho (RP23): confirmar de useAvisos y el PATCH según el rol ──
  const [updating, setUpdating] = useState(false);
  const handleDespachar = async (pedido: FilaPedido) => {
    const falta = mensajeFaltaBodega(pedido, { rol, warehouseId });
    if (falta) { avisar(falta, { tono: 'error' }); return; }
    if (!(await confirmar(confirmacionDespacho(pedido, nombreBodega)))) return;
    setUpdating(true);
    try {
      await apiFetch(`${RUTA_PEDIDOS}/${pedido.id}`, { method: 'PATCH', body: JSON.stringify(cuerpoDespacho(pedido, { rol, warehouseId })) });
      avisar('Pedido despachado exitosamente', { tono: 'ok' });
      setSelected((prev) => (prev ? { ...prev, estado: 'ENTREGADO' } : null));
      // La fila, las columnas de origen y destino (D39) y las tarjetas.
      recargarTodo(desdeTablero ? [desdeTablero.origen, desdeTablero.destino] : undefined);
      setDesdeTablero(null);
    } catch (err) {
      avisarError(err, 'No se pudo despachar el pedido');
      // La regla única (recargarTrasError): con un 400, un 409, un 422 (F8) o sin respuesta se recarga lo que se ve; un 404 o un 500, no.
      if (recargarTrasError(err)) recargarTodo();
    } finally {
      setUpdating(false);
    }
  };

  // Registrar cobro de saldo (B1 a B3; su PATCH NO se toca): ahora recarga también las pestañas y las tarjetas.
  const handleRegistrarCobroSaldo = async (pedido: FilaPedido) => {
    setUpdating(true);
    try {
      await apiFetch(`${RUTA_PEDIDOS}/${pedido.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          saldo_cop: 0,
          notas: pedido.notas ? `${pedido.notas} | Saldo 40% cobrado y verificado` : 'Saldo 40% verificado',
        }),
      });
      avisar('Cobro de saldo registrado. Pedido listo para despacho.', { tono: 'ok' });
      setSelected((prev) => (prev ? { ...prev, saldo_cop: 0 } : null));
      recargarTodo();
    } catch (err) {
      avisarError(err, 'No se pudo registrar el cobro del saldo');
      if (recargarTrasError(err)) recargarTodo();
    } finally {
      setUpdating(false);
    }
  };

  // ── bloque 3: el tablero (KANBAN-logistica punto 4; R15, C19, RP22) ──
  // reglaSoltarEntrega con el rol: despachar solo desde «Listo para despachar» (abre el Drawer), «Esperando» → «Listo» es un cambio a
  // LISTO_ENTREGA, y con saldo pendiente se bloquea con el monto. Sin rol que mueva, el tablero queda solo para ver.
  const reglaDelTablero = useCallback((p: FilaPedido, o: string, d: string) => reglaSoltarEntrega(p, o, d, { rol }), [rol]);
  async function cambiarDesdeTablero(p: FilaPedido, resultado: { estado: string }) {
    try {
      await apiFetch(`${RUTA_PEDIDOS}/${p.id}`, { method: 'PATCH', body: JSON.stringify({ estado: resultado.estado }) });
    } catch (err) {
      // D39: el tablero ya deshace y recarga el origen y el destino; aquí solo se refrescan las pestañas y las tarjetas.
      if (recargarTrasError(err)) { setVueltaConteos((n) => n + 1); setVueltaStats((n) => n + 1); }
      throw err;
    }
    setVueltaConteos((n) => n + 1);
    setVueltaStats((n) => n + 1);
  }
  function accionDesdeTablero(p: FilaPedido, resultado: { accion: string }, origen: string, destino: string) {
    if (resultado.accion !== 'despachar') return;
    setDesdeTablero({ origen, destino });
    setSelected(p);
  }
  const accionesTarjeta = useCallback((p: FilaPedido): ItemMenuFila[] => {
    const r = recordatorioSaldo(p);
    return r ? [{ etiqueta: 'Recordar el saldo por WhatsApp', icono: MessageCircle, onClick: () => abrirWhatsApp(r.url) }] : [];
  }, []);

  // ── bloque 2: la tabla (TABLA-inventario punto 10; R5, R26, D40, D41) ──
  const prefs = usePreferenciasTabla(ID_ENTREGAS, COLUMNAS_TABLA_ENTREGAS);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  const pestanas = pestanasEntrega(conteos);
  // m2 de T8: el conmutador Lista / Kanban poda los estados con las opciones del modo nuevo, con la regla de accionPestana.
  const alCambiarBarra = useCallback((accion: AccionTabla) => {
    if (accion.tipo === 'modo') {
      const modo = String(accion.valor);
      despachar(accionModo(estado, modo, modo === 'kanban' ? OPCIONES_ESTADOS_TABLERO_ENTREGA : opcionesEstadosEntrega));
    } else despachar(accion);
  }, [estado, despachar]);
  // R8: ordenada por una columna, el chip «Orden: … · Más recientes» vuelve al orden del servidor.
  const textoOrden = enKanban || !estado.orden || ordenEsAtencion(estado.orden) ? null : textoOrdenHub(estado.orden, TITULOS_ORDEN_ENTREGAS);
  const vacio = useMemo(() => {
    const texto = textoVacioEntregas({ vista: estado.vista, q: estado.q, estados: estado.estados });
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        {texto.ayuda && <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>}
      </div>
    );
  }, [estado.vista, estado.q, estado.estados]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: listado.total,
    estadoTotal: estadoDelTotal({ total: listado.total, cargando: listado.cargandoInicial, recargando: listado.recargando, error: listado.error }),
  };
  // m2: el botón de WhatsApp (recordatorio del saldo) visible en la tarjeta, armado aquí (accionPrincipal no arma clics desde lib).
  const tarjetaDe = useCallback((p: FilaPedido) => {
    const r = recordatorioSaldo(p);
    return { ...tarjetaEntrega(p), accionPrincipal: r ? { texto: 'Recordar el saldo por WhatsApp', onClick: () => abrirWhatsApp(r.url), tono: 'emerald' } : null };
  }, []);
  const resumenColumna = useCallback((clave: string, datos: { resumen?: unknown }) => {
    const texto = resumenColumnaEntrega(clave, datos.resumen);
    return texto ? <span className="text-[11px] font-semibold text-slate-600">{texto}</span> : null;
  }, []);

  // ── bloque 4: las tarjetas (KPI-inventario punto 8; R5, R12) ──
  // Solo «Pedidos despachados» equivale a una vista (la pestaña Despachados, con su MISMO conteo): al tocarla abre esa pestaña y otro
  // clic vuelve a la de trabajo. «Pedidos en curso» y «Saldo antes de despachar» son informativas (no son una pestaña).
  const vistaActiva = enKanban ? null : estado.vista;
  const elegirDespachados = () => {
    const vista = vistaDeTarjetaEntrega('ent_despachados') ?? INICIAL_ENTREGAS.vista;
    const siguiente = vistaActiva === vista ? INICIAL_ENTREGAS.vista : vista;
    despachar(accionVistaEnLista(estado, siguiente, opcionesEstadosEntrega));
  };
  const actualizando = listado.recargando || (cargandoConteos && cargadosConteos !== null) || (cargandoStats && stats.datos !== null);
  const tel = selected ? (selected.telefono_whatsapp || selected.customer_phone || '') : '';
  const urlTel = selected ? waUrl(tel, '') : null;

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in flex flex-col">
      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/entregas" color="rose" />

      <div className={CONTENEDOR}>
        <PageHeader icon={ArrowUpFromLine} color="rose"
          title="Cola de Despacho y Cobro de Saldo"
          subtitle="Control de salidas de bodega: avisa cuando a un pedido le falta cobrar el saldo antes de despachar."
          actions={(
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={() => recargarTodo()}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-xs shadow-sm transition-colors ${FOCOS.indigo}`}>
                <RefreshCw size={13} aria-hidden="true" className={actualizando ? 'animate-spin' : ''} /> Actualizar
              </button>
              <Link href="/dashboard/ventas/venta"
                className={`flex items-center gap-1.5 px-4 py-2.5 bg-rose-700 text-white rounded-xl hover:bg-rose-800 font-bold text-xs shadow-sm transition-colors ${FOCOS.indigo}`}>
                <Package size={14} aria-hidden="true" /> Ver Pedidos de Venta
              </Link>
            </div>
          )} />

        {/* B4 T19 (KPI-inventario punto 8; R7, R12): las 3 tarjetas. «Pedidos en curso» es el mismo número del Hub de Ventas; «Saldo antes
            de despachar», el saldo real de cada pedido según su forma de pago; «Pedidos despachados», el conteo de su pestaña. Mientras
            cargan, barras grises (nunca 0); con error, «—» y «Reintentar». La nota reemplaza la tarjeta «Protocolo 60/40». */}
        <FranjaKpis estado={estadoStats} titulo="Entregas" nota={NOTA_ENTREGAS}>
          <TarjetaKpi kpi="pven_en_curso" valor={tarjetas.en_curso.valor} ayuda="Por despachar" />
          <TarjetaKpi kpi="ent_saldo" valor={tarjetas.saldo.valor} ayuda="Según la forma de pago de cada pedido" />
          <TarjetaKpi kpi="ent_despachados" valor={tarjetas.despachados.valor} estado={estadoConteos}
            activo={vistaActiva === vistaDeTarjetaEntrega('ent_despachados')} onClick={elegirDespachados} />
        </FranjaKpis>
        {/* r3 (C2, m36): montado siempre, con reintentando y el destino del foco (la franja). */}
        <AvisoReintentar error={errorStats} fallo="No se pudieron cargar los indicadores de pedidos" onReintentar={stats.recargar} reintentando={stats.cargando} regionFoco="Entregas" />
        {errorConteos != null && (
          <AvisoReintentar error={errorConteos} fallo="No se pudieron contar los pedidos de cada pestaña" onReintentar={() => setVueltaConteos((n) => n + 1)} />
        )}

        {/* B4 T19 (TABLA-inventario punto 10, KANBAN-logistica punto 4): la barra y la tabla estándar en el servidor, o el tablero en
            modo servidor, con el MISMO estado (pestaña, búsqueda y estados). En Kanban las pestañas no se ven (el tablero trae las
            cuatro columnas). */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <AccionesFila.Provider value={accionesFila}>
            <section ref={refTarjeta} className={claseTarjeta}>
              <BarraTabla
                estado={estado}
                onEstado={alCambiarBarra}
                pestanas={enKanban ? undefined : pestanas}
                estadoConteos={estadoConteos}
                placeholder="Buscar PVEN, cliente o producto…"
                opcionesEstados={enKanban ? OPCIONES_ESTADOS_TABLERO_ENTREGA : opcionesEstadosEntrega}
                filtros={textoOrden ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                    {textoOrden}
                    <span aria-hidden="true">·</span>
                    <button type="button" onClick={() => despachar({ tipo: 'orden', valor: null })}
                      className={`rounded font-bold text-rose-700 hover:underline ${FOCOS.indigo}`}>
                      Más recientes
                    </button>
                  </span>
                ) : undefined}
                ajustes={{ columnas: COLUMNAS_TABLA_ENTREGAS, preferencias: prefs, anchoRef: anchoTablaRef }}
                kanbanDisponible
                pantallaCompleta={enKanban ? undefined : { completa, alternar }}
                color="rose"
                {...totalDeLaBarra}
              />
              {!enKanban && (
                <TablaEstandar
                  id={ID_ENTREGAS}
                  modo="servidor"
                  columnas={COLUMNAS_TABLA_ENTREGAS}
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
                  onFila={abrir}
                  vacio={vacio}
                  etiqueta="Pedidos por despachar"
                />
              )}
            </section>
          </AccionesFila.Provider>
          {enKanban ? (
            /* KANBAN-logistica punto 4: Esperando mercancía · Listo pero falta saldo · Listo para despachar · Despachados (plegada).
               Lo que no se puede queda bloqueado con su motivo ANTES de soltar (reglaSoltarEntrega con el rol); despachar abre el Drawer. */
            <TableroKanban
              tablero={tablero}
              regla={reglaDelTablero}
              tarjetaDe={tarjetaDe}
              onAbrir={abrir}
              onCambio={cambiarDesdeTablero}
              onAccion={accionDesdeTablero}
              accionesTarjeta={accionesTarjeta}
              resumenColumna={resumenColumna}
              color="rose"
              vacio="Sin pedidos aquí"
            />
          ) : null}
        </div>
      </div>

      {/* DRAWER LATERAL DE DESPACHO Y COBRO (B1 a B3) */}
      {selected && (
        <Drawer idTitulo="drawer-entrega-titulo" cierreExterno={!puedeDespacharPedido(selected, rol)}
          onClose={() => { setSelected(null); setDesdeTablero(null); }}
          header={(
            <div>
              <div className="flex items-center gap-2">
                <h2 id="drawer-entrega-titulo" className="text-xl font-black text-slate-800">{selected.numero}</h2>
                <CeldaEstado p={selected} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Control de Despacho y Verificación Financiera</p>
            </div>
          )}
          footer={(
            <>
              <Button variant="secondary" onClick={() => { setSelected(null); setDesdeTablero(null); }}>Cerrar</Button>
              {puedeDespacharPedido(selected, rol) && (
                <Button color="rose" icon={Truck} loading={updating} onClick={() => handleDespachar(selected)}>
                  Autorizar Salida y Despachar Pedido
                </Button>
              )}
            </>
          )}
        >
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-black text-slate-800 text-sm">{selected.customer_name || 'Cliente sin nombre'}</h4>
                <p className="text-xs text-slate-500">{tel || 'Sin teléfono registrado'}</p>
              </div>
              {urlTel && (
                <a href={urlTel} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp con el cliente de ${selected.numero}`}
                  className={`p-2 bg-emerald-100 text-emerald-800 rounded-xl hover:bg-emerald-200 transition-colors ${FOCOS.indigo}`}>
                  <MessageCircle size={16} aria-hidden="true" />
                </a>
              )}
            </div>
            <p className="text-xs text-slate-500 pt-1 border-t border-slate-200/60">
              Dirección: <strong>{selected.direccion_entrega || selected.customer_address || 'Pendiente por confirmar'}</strong>
            </p>
          </div>

          {(() => {
            const saldo = saldoEntrega(selected);
            const tieneSaldo = saldo > 0;
            return (
              <div className={`p-5 rounded-2xl border ${tieneSaldo ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-wider">Estado Financiero del Pedido</span>
                  <CeldaCobro p={selected} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center py-2 border-y border-amber-200/50 my-2">
                  <div>
                    <p className="text-[10px] text-slate-600 uppercase font-bold">Total</p>
                    <p className="font-bold text-xs mt-0.5 text-slate-800">{pesos(selected.total_cop)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-600 uppercase font-bold">Anticipo</p>
                    <p className="font-bold text-xs mt-0.5 text-emerald-700">{pesos(selected.anticipo_cop ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-600 uppercase font-bold">Saldo</p>
                    <p className={`font-black text-xs mt-0.5 ${tieneSaldo ? 'text-rose-700' : 'text-emerald-700'}`}>{pesos(saldo)}</p>
                  </div>
                </div>
                {saldo < 0 && (
                  <p className="text-[11px] text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 mt-1">
                    El cliente pagó de más: hay un crédito a favor de <strong>{pesos(Math.abs(saldo))}</strong> pendiente de coordinar (reembolso o abono a otro pedido).
                  </p>
                )}
                {/* B4 T24 f3 (F95): con saldo, TODOS ven por qué no se despacha (el motivo del tablero); cobrarlo es de ADMIN y ASESOR. */}
                {tieneSaldo && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] text-amber-900 leading-tight">{textoFaltaSaldo(selected)}</p>
                    {puedeCobrarSaldo(rol) && (
                      <Button size="sm" color="emerald" loading={updating} onClick={() => handleRegistrarCobroSaldo(selected)}>
                        Marcar Saldo Cobrado
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <div>
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2.5">Productos a Despachar</h4>
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Producto</th>
                    <th className="px-4 py-2.5 text-center">Cant.</th>
                    <th className="px-4 py-2.5 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selected.productos ?? []).length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-3 text-center text-slate-500">Este pedido no trae productos.</td></tr>
                  ) : (selected.productos ?? []).map((p, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{p.product_name || 'Ítem'}</td>
                      <td className="px-4 py-2.5 text-center font-bold">{p.qty ?? 1}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-700">{pesos(Number(p.qty ?? 1) * Number(p.unit_price_cop ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bodega de salida: siempre con Bodega (RP23); con ADMIN y ASESOR, si hay líneas de catálogo (con sku_id). */}
          {puedeDespacharPedido(selected, rol) && (
            <div>
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2.5">Bodega de Despacho</h4>
              <select aria-label="Bodega de despacho" value={warehouseId} disabled={!bodegas.filas}
                onChange={(e) => setBodegaElegida(e.target.value)}
                className={`w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm disabled:text-slate-500 ${FOCOS.indigo}`}>
                <option value="">{bodegas.filas ? 'Seleccionar...' : (bodegas.error ? 'No se pudieron cargar' : 'Cargando bodegas…')}</option>
                {(bodegas.filas ?? []).map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
              </select>
              {bodegas.error != null && bodegas.filas === null && (
                <div className="mt-2"><AvisoReintentar error={bodegas.error} fallo="No se pudieron cargar las bodegas" onReintentar={recargarBodegas} /></div>
              )}
              <p className="text-[11px] text-slate-500 mt-1">Si el pedido tiene productos de catálogo, se descontará el stock real de la bodega elegida al despachar.</p>
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}
