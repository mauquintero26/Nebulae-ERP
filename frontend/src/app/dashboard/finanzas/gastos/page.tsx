"use client";

import { CreditCard, Layers, Plus, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/api';
// B4 T22 (TABLA-otros punto 7, KANBAN-resto, ANALISIS-finanzas punto 4; R5, R11, R16, RP26, RP57, RP58, RP104): Gastos en la tabla
// estándar en modo servidor ('finanzas.gastos'; q, orden, limit y offset del estado único), en pesos («Monto (COP)» y
// formatoPesos) y con un tablero solo para ver por categoría (las claves de `conteos`, 12 como máximo, con su aviso y un filtro de
// categoría en la barra para seguirlo). El alta del gasto (B1 a B3) sigue: la fecha sale como mediodía de Colombia (RP57).
import { SubNav, PageHeader, Modal, Button, TableroKanban, TarjetaKanban, useAvisos, useTableroKanban } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ColumnaTabla } from '@/components/tabla';
import { fechaLarga } from '@/lib/fechas-colombia';
import { formatoPesos, redondearPeso } from '@/lib/pesos';
import { ofreceReintentar, textoDeError } from '@/lib/avisos';
import { accesoFinanzas } from '@/lib/roles';
import { useRolActual } from '@/components/ui/useRolActual';
import {
  MAX_COLUMNAS_GASTOS, TEXTO_SOLO_VER_GASTOS, categoriasDeConteos, columnasGastos, consultaColumnaGasto, dependenciasTablero, estadoDelTotal, estadoTableroGastos, extraGastos,
  fechaDeGasto, normalizarRespuesta, tarjetaGasto, textoVacioGastos, tipoDeGasto, urlConteosGastos,
} from '@/lib/tabla';
// Las piezas del selector de categoría y el contenedor de las pantallas del bloque son las de Inventario (T18): no se copian.
import { CONTENEDOR, SelectorCatalogo } from '../../inventario/piezas-inventario';
import { CAJA_SIN_PERMISO, FOCOS } from '@/lib/design-system';
import type { Catalogo } from '../../inventario/piezas-inventario';
import { FIN_NAV } from '../fin-nav';

const CATEGORIAS = ['Pauta Digital', 'Nómina', 'Arriendo', 'Suscripciones', 'Equipos', 'Servicios Públicos', 'Transporte', 'Otro'];

/** Un gasto de GET /finance/expenses: los nombres son los del servidor (ExpenseResponse). */
type Gasto = {
  id: number;
  category: string;
  description?: string | null;
  amount: number | string;
  incurred_date?: string | null;
  is_recurring?: boolean | null;
};
type ConteosCargados = { clave: string; datos: Record<string, number> | null; error: unknown };

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_GASTOS = 'finanzas.gastos';
/** Lo más nuevo primero (el orden por defecto del servidor, dicho en el estado para que la flecha de «Fecha» se vea). */
const INICIAL_GASTOS = { orden: '-fecha' };

/**
 * La tabla (R5, R26, D41): ID / Fecha (la fecha es el día de Colombia, RP57), Categoría, Concepto, Tipo y «Monto (COP)» con
 * formatoPesos (R16). Se ordena por lo que el servidor acepta (fecha, categoria, concepto, tipo y monto, RP58). A 1024 px con
 * el menú abierto la caja deja 704 px: 170 + 150 + 140 + 100 + 140 = 700. Una constante: estable (D40).
 */
const COLUMNAS_GASTOS: ColumnaTabla<Gasto>[] = [
  { id: 'fecha', titulo: 'ID / Fecha', ancho: 170, clave: true, ordenable: 'fecha', titleCelda: (g) => `EXP-${g.id} · ${fechaLarga(g.incurred_date) || 'Sin fecha'}`,
    celda: (g) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-xs font-bold text-slate-800">EXP-{g.id}</span>
        <span className="truncate text-xs text-slate-600">{fechaLarga(g.incurred_date) || 'Sin fecha'}</span>
      </span>
    ) },
  { id: 'categoria', titulo: 'Categoría', ancho: 150, ordenable: 'categoria', titleCelda: (g) => g.category,
    celda: (g) => (
      <span className="inline-block max-w-full truncate rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{g.category}</span>
    ) },
  { id: 'concepto', titulo: 'Concepto', ancho: 140, flexible: true, ordenable: 'concepto', titleCelda: (g) => g.description || 'Sin concepto',
    celda: (g) => <span className="block truncate text-xs font-medium text-slate-600">{g.description || '—'}</span> },
  { id: 'tipo', titulo: 'Tipo', ancho: 100, ordenable: 'tipo', titleCelda: (g) => tipoDeGasto(g),
    celda: (g) => <span className={`text-xs font-bold ${g.is_recurring ? 'text-blue-700' : 'text-amber-700'}`}>{tipoDeGasto(g)}</span> },
  { id: 'monto', titulo: 'Monto (COP)', ancho: 140, clave: true, alinear: 'derecha', ordenable: 'monto', titleCelda: (g) => formatoPesos(g.amount),
    celda: (g) => <span className="text-sm font-black text-slate-800">{formatoPesos(g.amount)}</span> },
];

/** B4 T24 (FINAL-C5): lo que ve un rol sin permiso (GET /finance/expenses es de ADMIN y FINANZAS): un texto neutro, sin «Reintentar». */
const TEXTO_SIN_GASTOS = 'Tu rol no ve los gastos.';

/** Un gasto no tiene ficha: la tarjeta del tablero no ofrece «Abrir» (renderTarjeta no pinta el menú), y esto solo cumple la firma. */
const sinFicha = () => {};

const BOTON_SECUNDARIO = `flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 ${FOCOS.indigo}`;

export default function GastosPage() {
  const { avisar, avisarError } = useAvisos();
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: CATEGORIAS[0], description: '', amount: '', incurred_date: '', is_recurring: false });

  // ── B4 T22, bloque G-2: la carga del servidor (R5, D40) ──
  // El estado ÚNICO de la pantalla (búsqueda q, orden, página y tamaño 25 o 50); el modo (Lista o Kanban) va en vista:finanzas.gastos
  // (RP26). El filtro de categoría de la barra va al servidor como `categoria` y cada cambio vuelve a la página 1.
  const [estado, despachar, listo] = useEstadoTabla(ID_GASTOS, INICIAL_GASTOS);
  const enKanban = estado.modo === 'kanban';
  // B4 T24 (FINAL-C5): el rol se lee después de montar (useRolActual) y decide qué se pide (accesoFinanzas, lib/roles.js): sin permiso
  // no se pide la lista, ni los conteos, ni el tablero; con el rol vacío (la hidratación), se espera con el esqueleto.
  const rol = useRolActual();
  const acceso = accesoFinanzas(rol);
  // B4 T24 (F39 y FINAL-m19): la categoría y el tipo son filtros del estado único (estado.filtros): vuelven con la sesión junto a la
  // página, la búsqueda y el orden (antes eran useState y al volver se veía la página N sin el filtro).
  const categoria = estado.filtros?.categoria ?? '';
  // m17: el tipo (recurrente | variable) también va al servidor (RP58) y vuelve a la página 1.
  const tipo = estado.filtros?.tipo ?? '';
  const filtros = useMemo(() => ({ categoria, tipo }), [categoria, tipo]);
  const extraLista = useMemo(() => extraGastos(filtros), [filtros]);
  // GET /finance/expenses con q, orden, limit y offset. esperar: !listo (D40): el esqueleto, nunca «vacío». En Kanban no pide la lista.
  const listado = useListado<Gasto>({
    ruta: '/finance/expenses', estado, esperar: !listo || !acceso.listo, despachar, activo: !enKanban && acceso.gastos, extra: extraLista,
  });

  // Los conteos por categoría ({categoría: n}, con la búsqueda y sin la categoría): las columnas del tablero y las opciones del filtro.
  // Se piden aparte porque en Kanban la lista no se pide. Un error o una recarga no borran lo último que llegó.
  const urlConteos = urlConteosGastos(estado, filtros);
  const [vueltaConteos, setVueltaConteos] = useState(0);
  const claveConteos = `${urlConteos}|${vueltaConteos}`;
  const [conteos, setConteos] = useState<ConteosCargados | null>(null);
  useEffect(() => {
    if (!listo || !acceso.gastos) return undefined;
    const control = new AbortController();
    apiFetch(urlConteos, { signal: control.signal })
      .then((r: unknown) => setConteos({ clave: claveConteos, datos: normalizarRespuesta(r).conteos as Record<string, number> | null, error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setConteos((c) => ({ clave: claveConteos, datos: c?.datos ?? null, error: err })); });
    return () => control.abort();
  }, [listo, acceso.gastos, urlConteos, claveConteos]);
  const recargandoConteos = listo && conteos?.clave !== claveConteos;
  // I1 y m12: qué muestra el tablero (cargando, error o listo; un error SE DICE también con conteos viejos y lo viejo queda atenuado).
  const estadoConteos = estadoTableroGastos(conteos, claveConteos);
  const recargarConteos = useCallback(() => setVueltaConteos((n) => n + 1), []);
  // El selector de Inventario pide ids numéricos: la opción es la posición en la lista (1, 2…) y la categoría elegida es su nombre.
  const catalogoCategorias = useMemo(
    (): Catalogo => ({ filas: (categoriasDeConteos(conteos?.datos ?? null, categoria) ?? null)?.map((o, i) => ({ id: i + 1, name: o.name })) ?? null, error: estadoConteos.error }),
    [conteos, categoria, estadoConteos.error],
  );

  // ── bloque G-3: el tablero solo para ver, en modo servidor (R11, C4, D39) ──
  // Una columna por categoría de `conteos` (12 como máximo; el resto se ve en la lista, con su aviso). Una consulta por columna
  // (consultaColumnaGasto: categoria, la búsqueda y el orden del MISMO estado). El orden del hook ('sin_movimiento') NO se manda.
  const { columnas: columnasTablero, aviso: avisoCategorias } = useMemo(() => columnasGastos(conteos?.datos ?? null, MAX_COLUMNAS_GASTOS, categoria), [conteos, categoria]);
  const tablero = useTableroKanban<Gasto>({
    pantalla: ID_GASTOS,
    modo: 'servidor',
    columnas: columnasTablero,
    activo: listo && acceso.gastos && enKanban && conteos?.datos != null && columnasTablero.length > 0,
    porColumna: estado.tamano,
    dependencias: [...dependenciasTablero(estado), estado.orden, categoria, tipo],
    cargar: async (columna, { offset, limit, signal }) => {
      const consulta = consultaColumnaGasto(estado, columna, filtros, { limit, offset });
      if (consulta === null) return { filas: [], total: 0 };
      return normalizarRespuesta(await apiFetch(`/finance/expenses?${consulta}`, { signal }));
    },
  });

  // «Actualizar» y lo que sigue a guardar: la lista, el tablero y los conteos. Ninguna recarga vacía lo que se ve.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarTablero();
    recargarConteos();
  }, [recargarListado, recargarTablero, recargarConteos]);

  // ── bloque G-2: la tabla (R5, R26; D40, D41) ──
  const prefs = usePreferenciasTabla(ID_GASTOS, COLUMNAS_GASTOS);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  const valorCategoria = String(catalogoCategorias.filas?.find((o) => o.name === categoria)?.id ?? '');
  const cambiarTipo = useCallback((valor: string) => {
    despachar({ tipo: 'filtro', clave: 'tipo', valor });
  }, [despachar]);
  const cambiarCategoria = useCallback((valor: string) => {
    despachar({ tipo: 'filtro', clave: 'categoria', valor });
  }, [despachar]);
  // El «vacío» memoizado dice qué lo deja vacío (la búsqueda, la categoría o nada).
  const vacio = useMemo(() => {
    const texto = textoVacioGastos({ q: estado.q, categoria, tipo });
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        {texto.ayuda && <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>}
      </div>
    );
  }, [estado.q, categoria, tipo]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: listado.total,
    estadoTotal: estadoDelTotal({ total: listado.total, cargando: listado.cargandoInicial, recargando: listado.recargando, error: listado.error }),
  };

  // ── bloque G-4: el alta del gasto (B1 a B3, conservada) ──
  async function handleCreate() {
    if (!form.category || !form.amount) { avisar('Categoría y monto son obligatorios.', { tono: 'error' }); return; }
    setSaving(true);
    try {
      await apiFetch('/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: form.category,
          description: form.description || null,
          amount: redondearPeso(parseFloat(form.amount)), // pesos enteros, sin centavos (R16)
          // RP57: el día elegido como mediodía de Colombia (sin fecha, hoy en Colombia): nunca medianoche UTC.
          incurred_date: fechaDeGasto(form.incurred_date),
          is_recurring: form.is_recurring,
        }),
      });
      avisar('Gasto registrado');
      setShowModal(false);
      setForm({ category: CATEGORIAS[0], description: '', amount: '', incurred_date: '', is_recurring: false });
      recargarTodo();
    } catch (e) {
      avisarError(e, 'Error al registrar el gasto');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full h-full overflow-y-auto animate-in fade-in duration-500 custom-scrollbar bg-slate-50">
      <SubNav label="Finanzas" items={FIN_NAV} currentPath="/dashboard/finanzas/gastos" color="rose" />

      {/* RESERVA_BOTON_IA (pb-24, en CONTENEDOR; F44-a) deja libre, con la página al fondo, la esquina del botón flotante de la IA. */}
      <div className={CONTENEDOR}>

      {/* Header */}
      <PageHeader icon={CreditCard} color="rose"
        title="Control de Gastos (OPEX)"
        subtitle="Gestión de nómina, pauta, arriendos y otros gastos operativos."
        actions={acceso.gastos ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={recargarTodo} className={BOTON_SECUNDARIO}>
              <RefreshCw size={13} aria-hidden="true" className={listado.recargando || recargandoConteos ? 'animate-spin' : ''} /> Actualizar
            </button>
            <Button color="rose" icon={Plus} onClick={() => setShowModal(true)}>Añadir Gasto</Button>
          </div>
        ) : undefined} />

      {/* La barra con la búsqueda (q) y el filtro de categoría (para seguir el aviso «N categorías más»), y la tabla estándar en el
          servidor o el tablero solo para ver por categoría con el MISMO estado. */}
      {acceso.listo && !acceso.gastos ? (
        <p role="status" className={`${CAJA_SIN_PERMISO}`}>{TEXTO_SIN_GASTOS}</p>
      ) : (
      <div className="flex min-w-0 flex-col gap-4">
        {capa}
        <section ref={refTarjeta} className={claseTarjeta}>
          <BarraTabla
            estado={estado}
            onEstado={despachar}
            placeholder="Buscar por categoría o concepto…"
            filtros={(
              <>
              <label className="inline-flex items-center gap-1.5">
                <select aria-label="Tipo" value={tipo} onChange={(e) => cambiarTipo(e.target.value)}
                  className={`max-w-[11rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 ${FOCOS.indigo}`}>
                  <option value="">Todos los tipos</option>
                  <option value="recurrente">Recurrentes</option>
                  <option value="variable">Variables</option>
                </select>
              </label>
              <SelectorCatalogo etiqueta="Categoría" todas="Todas las categorías" cargando="Cargando categorías…"
                fallo="No se pudieron cargar las categorías" catalogo={catalogoCategorias} valor={valorCategoria}
                onCambiar={(valor) => cambiarCategoria(catalogoCategorias.filas?.find((o) => String(o.id) === valor)?.name ?? '')} onReintentar={recargarConteos} icono={Layers} acento="indigo" />
              </>
            )}
            ajustes={{ columnas: COLUMNAS_GASTOS, preferencias: prefs, anchoRef: anchoTablaRef }}
            kanbanDisponible
            pantallaCompleta={enKanban ? undefined : { completa, alternar }}
            color="rose"
            {...totalDeLaBarra}
          />
          {!enKanban && (
            <TablaEstandar
              id={ID_GASTOS}
              modo="servidor"
              columnas={COLUMNAS_GASTOS}
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
              vacio={vacio}
              etiqueta="Control de gastos"
            />
          )}
        </section>
        {estadoConteos.tipo === 'listo' && estadoConteos.error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {textoDeError(estadoConteos.error, 'No se pudieron actualizar las categorías')} (se ven las últimas que llegaron)
            {ofreceReintentar(estadoConteos.error) && (
            <button type="button" onClick={recargarConteos}
              className={`inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 ${FOCOS.indigo}`}>
              <RefreshCw size={13} aria-hidden="true" /> Reintentar
            </button>
            )}
          </div>
        ) : null}
        {enKanban ? (
          /* KANBAN-resto: una columna por categoría (12 como máximo, con su aviso), solo para ver: sin regla, con su motivo. Un gasto no
             tiene ficha: la tarjeta no ofrece «Abrir». Sin los conteos no hay columnas: se dice (con «Reintentar» si fallaron). */
          estadoConteos.tipo !== 'listo' ? (
            estadoConteos.tipo === 'error' ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                {textoDeError(estadoConteos.error, 'No se pudieron cargar las categorías')}
                {ofreceReintentar(estadoConteos.error) && (
                <button type="button" onClick={recargarConteos}
                  className={`inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 ${FOCOS.indigo}`}>
                  <RefreshCw size={13} aria-hidden="true" /> Reintentar
                </button>
                )}
              </div>
            ) : (
              <div role="status" aria-busy="true" className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">Cargando las categorías…</div>
            )
          ) : columnasTablero.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
              {estado.q.trim() || categoria || tipo ? textoVacioGastos({ q: estado.q, categoria, tipo }).titulo : 'Todavía no hay gastos: registra el primero para ver el tablero.'}
            </div>
          ) : (
            <div aria-busy={estadoConteos.actualizando || undefined} className={estadoConteos.actualizando ? 'opacity-60' : undefined}>
            <TableroKanban
              tablero={tablero}
              soloLectura={TEXTO_SOLO_VER_GASTOS}
              tarjetaDe={tarjetaGasto}
              renderTarjeta={(g) => <TarjetaKanban {...tarjetaGasto(g)} />}
              onAbrir={sinFicha}
              color="rose"
              vacio="Sin gastos en esta categoría"
              aviso={avisoCategorias
                ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">{avisoCategorias}</p>
                : undefined}
            />
            </div>
          )
        ) : null}
      </div>
      )}

      {/* Modal Añadir Gasto */}
      {showModal && (
        <Modal cierreExterno={false} title="Añadir Gasto" icon={CreditCard} color="rose" onClose={() => setShowModal(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button color="rose" loading={saving} onClick={handleCreate}>Guardar Gasto</Button>
            </>
          )}>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Categoría *</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500">
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Concepto</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Ej. Salarios 1ra Quincena" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Monto (COP) *</label>
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Fecha</label>
                <input type="date" value={form.incurred_date} onChange={e => setForm(f => ({ ...f, incurred_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} />
              Gasto recurrente
            </label>
        </Modal>
      )}
      </div>
    </div>
  );
}
