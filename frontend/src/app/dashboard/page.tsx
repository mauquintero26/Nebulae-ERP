"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertTriangle, CheckCircle2, Truck, ChevronRight, ArrowRight,
  BrainCircuit, Sparkles, Activity, ShoppingCart,
  Calendar, BarChart3, Send, RefreshCw, Layers,
} from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { FOCOS, RESERVA_BOTON_IA } from '@/lib/design-system';
import { avisoDeFuente, ofreceReintentar } from '@/lib/avisos';
import { accesoCopilot } from '@/lib/roles';
import { useRolActual } from '@/components/ui/useRolActual';
import { AvisoDeError } from '@/components/ui/AvisoFuente';
// B4 T22 (KPI-otros punto 1, FLUJO-ventas-pantallas E; R7, R12, RP104): las tarjetas leen los mismos endpoints que los Hubs
// (/ventas/stats, /compras/stats e /inventory/stats), el embudo es PasosFlujo con /ventas/flujo y el selector es Semana,
// 30 días o Mes. El Copilot (/chat/copilot/query) y las listas «Recientes» siguen como estaban.
import { FranjaKpis, TarjetaKpi, useEstadoKpi } from '@/components/ui';
import { PasosFlujo, useResumenFlujo } from '@/components/flujo';
import { estadoDeFranja } from '@/lib/flujo';
import { avisoEmbudoDashboard, pasosEmbudoDashboard } from '@/lib/flujo-ventas';
import { infoEstadoPec } from '@/lib/estados-compras';
import { infoEstadoPedido } from '@/lib/estados-pedido';
import {
  PERIODOS_DASHBOARD, RUTA_RADAR, TEXTO_PERIODO, datosDeRespuesta, etiquetaKpi, lecturaDeFuente, periodoDashboard, periodoVisto,
  radarOperativo, tarjetasInventarioDashboard, tarjetasVitalesDashboard, textoRadar,
} from '@/lib/kpis';

function formatCOP(v: number | string | null | undefined) {
  const num = Number(v) || 0;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(num);
}

/**
 * Una fuente del Dashboard: GET `url` y su `data`. Cada fuente falla sola (las demás siguen). Mientras vuelve a pedirse
 * (Actualizar, otro período) se CONSERVA lo último que llegó y `cargando` es true: el número queda en 'actualizando', nunca en
 * 0 ni en la barra de la primera carga (lecturaDeFuente). Un error no deja datos viejos. `marca` es el período de los datos que
 * se ven: el rótulo de la tarjeta sale de él, no del que se acaba de elegir.
 */
function useFuente<T>(url: string, marca: string | null = null) {
  const [vuelta, setVuelta] = useState(0);
  const clave = `${url}|${vuelta}`;
  const [llego, setLlego] = useState<{ vuelta: string; datos: T | null; error: unknown; marca: string | null } | null>(null);
  useEffect(() => {
    const control = new AbortController();
    // Una respuesta sin `data` es un error (datosDeRespuesta lanza y cae en el catch).
    apiFetch(url, { signal: control.signal })
      .then((r: unknown) => setLlego({ vuelta: clave, datos: datosDeRespuesta(r) as T, error: null, marca }))
      .catch((err: unknown) => { if (!control.signal.aborted) setLlego({ vuelta: clave, datos: null, error: err, marca }); });
    return () => control.abort();
  }, [url, clave, marca]);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  return { ...lecturaDeFuente(llego, clave), recargar };
}

/** El `data` de cada endpoint (los nombres son los del servidor; las funciones de lib/kpis.js leen solo lo que necesitan). */
type DatosEndpoint = Record<string, unknown>;

export default function DashboardGeneral() {
  const [periodo, setPeriodo] = useState<'7d' | '30d' | 'mes'>(periodoDashboard(null));
  // Las «Recientes» (3 pedidos de compra y 3 de venta): siguen con sus llamadas de siempre.
  const [loading, setLoading] = useState(true);
  const [recientes, setRecientes] = useState({ pecsActivos: [] as any[], pedidosRecientes: [] as any[] });

  // ─── LAS FUENTES DE LAS TARJETAS (los mismos endpoints que los Hubs, R7) ──────────────────────────────────────────
  const ventas = useFuente<DatosEndpoint>(`/ventas/stats?periodo=${periodo}`, periodo);
  const compras = useFuente<DatosEndpoint>(`/compras/stats?periodo=${periodo}`, periodo);
  const inventario = useFuente<DatosEndpoint>('/inventory/stats');
  const clientes = useFuente<unknown[]>('/crm/customers');
  const flujo = useResumenFlujo('/ventas/flujo', 0);
  const estadoVentas = useEstadoKpi(ventas.cargando, ventas.error);
  const estadoInventario = useEstadoKpi(inventario.cargando, inventario.error);
  const estadoClientes = useEstadoKpi(clientes.cargando, clientes.error);
  const vitales = tarjetasVitalesDashboard(ventas.datos, Array.isArray(clientes.datos) ? clientes.datos.length : null);
  const existencias = tarjetasInventarioDashboard(inventario.datos, compras.datos);
  const radar = radarOperativo(ventas.datos);
  // m3 y m11: el rótulo y el «vs …» son los del período de los DATOS que se ven (el número viejo conserva su rótulo hasta que llega el nuevo).
  const periodoDatos = periodoVisto(ventas.marca, periodo);
  const textoPeriodo = TEXTO_PERIODO[periodoDatos].comparado;
  // El embudo: la caja con error o recargando dice «—» o se atenúa como en la franja del Hub (estadoDeFranja).
  const [huboErrorEmbudo, setHuboErrorEmbudo] = useState(false);
  const franjaEmbudo = estadoDeFranja({ cargando: flujo.cargando, error: flujo.error, huboError: huboErrorEmbudo });
  if (franjaEmbudo.conError !== huboErrorEmbudo) setHuboErrorEmbudo(franjaEmbudo.conError);
  const avisoEmbudo = avisoEmbudoDashboard({ cargando: flujo.cargando, error: flujo.error, huboError: huboErrorEmbudo });
  const pasosEmbudo = useMemo(() => pasosEmbudoDashboard(flujo.datos), [flujo.datos]);

  // ─── COPILOTO IA ───────────────────────────────────────────────────────────
  // B4 T24 (FINAL-m23): el rol después de montar (useRolActual) y si puede consultar el copiloto (accesoCopilot, lib/roles.js).
  const rol = useRolActual();
  const accesoIa = accesoCopilot(rol);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<{
    answer: string;
    source: string;
    timestamp: string;
  } | null>(null);

  // ─── LAS «RECIENTES» (sin cambios: 3 pedidos de compra y 3 de venta) ───────────────────────────────────────────────
  const loadRecientes = useCallback(async () => {
    setLoading(true);
    try {
      const salesRes = await apiFetch('/ventas/pedidos').catch(() => []);
      const salesList = Array.isArray(salesRes) ? salesRes : (salesRes?.data || []);
      const purchasesRes = await apiFetch('/compras/pedidos').catch(() => []);
      const purchasesList = Array.isArray(purchasesRes) ? purchasesRes : (purchasesRes?.data || []);
      setRecientes({ pecsActivos: purchasesList.slice(0, 3), pedidosRecientes: salesList.slice(0, 3) });
    } catch (e) {
      console.error('Error cargando los pedidos recientes del dashboard', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecientes();
  }, [loadRecientes]);

  // «Actualizar»: las recientes y todas las fuentes de las tarjetas (ninguna vacía lo que se ve mientras llega la nueva).
  const { recargar: recargarVentas } = ventas;
  const { recargar: recargarCompras } = compras;
  const { recargar: recargarInventario } = inventario;
  const { recargar: recargarClientes } = clientes;
  const { recargar: recargarFlujo } = flujo;
  const loadDashboardData = useCallback(() => {
    loadRecientes();
    recargarVentas();
    recargarCompras();
    recargarInventario();
    recargarClientes();
    recargarFlujo();
  }, [loadRecientes, recargarVentas, recargarCompras, recargarInventario, recargarClientes, recargarFlujo]);
  const recargando = loading || ventas.cargando || compras.cargando || inventario.cargando || clientes.cargando || flujo.cargando;

  // ─── CONSULTA AL COPILOTO IA ───────────────────────────────────────────────
  const handleAskAI = async (customPrompt?: string) => {
    const q = (customPrompt || aiQuestion).trim();
    if (!q || !accesoIa.consultar) return;

    setAiLoading(true);
    try {
      const res = await apiFetch('/chat/copilot/query', {
        method: 'POST',
        body: JSON.stringify({ prompt: q }),
      });
      if (res?.data) {
        setAiResponse({
          answer: res.data.answer,
          source: res.data.source || 'Nebulae Kernel IA',
          timestamp: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        });
      }
    } catch (err: any) {
      // B4 T24 (FINAL-m23): la causa real (avisoDeFuente): un 403 es un tema de permiso; lo demás, el detalle del servidor.
      setAiResponse({
        answer: avisoDeFuente(err, 'No se pudo consultar el copiloto')!.texto,
        source: 'Error',
        timestamp: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
      });
    } finally {
      setAiLoading(false);
      if (!customPrompt) setAiQuestion('');
    }
  };

  const currentDateStr = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  return (
    <div className={`w-full shrink-0 bg-slate-50 min-h-screen ${RESERVA_BOTON_IA} animate-in fade-in custom-scrollbar`}>
      
      {/* 1. Radar de Alertas Operativas */}
      {/* El radar cuenta los pedidos pendientes de compra de /ventas/stats (la pestaña «Pend. Compra» de Pedidos de venta), no
          los de la lista de «Recientes». Sin el dato (cargando o con error) no dice ni «alerta» ni «todo bien». */}
      {radar?.tipo === 'alerta' ? (
        <div className="bg-amber-600 text-white px-6 py-2.5 flex items-center justify-between shadow-sm shrink-0 relative z-20">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            <AlertTriangle size={16} className="text-amber-200" />
            <p className="text-xs font-bold tracking-wide">
              RADAR OPERATIVO: <span className="font-normal opacity-95">{textoRadar(radar.n)}</span>
            </p>
          </div>
          <Link href={RUTA_RADAR} className="text-xs font-bold underline hover:text-amber-100 flex items-center gap-1">
            Ver pedidos <ChevronRight size={13} />
          </Link>
        </div>
      ) : (
        <div className="bg-slate-900 text-white px-6 py-2.5 flex items-center justify-between shadow-sm shrink-0 relative z-20">
          <div className="flex items-center gap-2.5">
            {radar?.tipo === 'ok' ? <CheckCircle2 size={14} className="text-emerald-400" /> : <AlertTriangle size={14} className="text-slate-400" />}
            <p className="text-xs font-medium text-slate-300" role={ventas.error ? 'alert' : undefined}>
              {radar?.tipo === 'ok'
                ? 'SISTEMA OPERATIVO: Flujo de inventario y pedidos sincronizados sin bloqueos de despacho.'
                : ventas.error
                  ? 'RADAR OPERATIVO: no se pudo calcular el estado de los pedidos.'
                  : 'RADAR OPERATIVO: calculando…'}
              {/* f4 r1 (R1-m1): un 403 no se reintenta (ofreceReintentar). */}
              {ofreceReintentar(ventas.error) ? (
                <button type="button" onClick={ventas.recargar}
                  className={`ml-2 rounded font-bold underline hover:text-white ${FOCOS.blanco}`}>
                  Reintentar
                </button>
              ) : null}
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400 font-semibold">Nebulae Hub 2026</span>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        
        {/* Header Principal */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Activity className="text-purple-600" size={28} /> Torre de Control General
            </h1>
            <p className="text-slate-500 mt-1 text-xs font-medium flex items-center gap-2 capitalize">
              <Calendar size={14} /> {currentDateStr}
            </p>
          </div>
          {/* flex-wrap: con el menú abierto a 768 px, Actualizar y el selector bajan de renglón en lugar de correr la página. */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={loadDashboardData}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3.5 py-2 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
            >
              <RefreshCw size={13} className={recargando ? 'animate-spin' : ''} /> Actualizar
            </button>
            {/* R7: Semana ('7d'), 30 días ('30d') y Mes ('mes'); el período se manda a /ventas/stats y a /compras/stats y cambia la
                comparación (el % de las tarjetas de dinero). Se quitó «Hoy», que no hacía nada. */}
            <div role="group" aria-label="Período de las tarjetas" className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              {PERIODOS_DASHBOARD.map((p) => (
                <button
                  key={p.clave}
                  type="button"
                  aria-pressed={periodo === p.clave}
                  onClick={() => setPeriodo(p.clave)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${FOCOS.indigo} ${
                    periodo === p.clave ? 'bg-slate-800 text-white shadow' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {p.etiqueta}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2. COPILOTO IA INTERACTIVO (Box LLM Integrado a Nebulae). B4 T24 (FINAL-m23): solo para quien puede consultarlo
            (POST /chat/copilot/query es de ADMIN, ASESOR y FINANZAS: accesoCopilot). */}
        {accesoIa.consultar && (
        <div className="bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-950 rounded-3xl p-1 shadow-xl relative overflow-hidden border border-purple-800/40">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <BrainCircuit size={160} className="text-white" />
          </div>

          <div className="bg-slate-900/60 backdrop-blur-md rounded-[22px] p-6 space-y-5 relative z-10">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-[0_0_25px_rgba(168,85,247,0.4)] shrink-0 text-white p-3">
                  <Sparkles size={26} />
                </div>
                <div>
                  <h3 className="font-black text-lg text-purple-200 flex items-center gap-2">
                    Nebulae Copilot AI <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-400/30">Motor LLM Activo</span>
                  </h3>
                  <p className="text-xs text-slate-300 font-medium">
                    Consulta inteligente en lenguaje natural conectada a todo el contexto de Inventario, Ventas y Compras.
                  </p>
                </div>
              </div>
            </div>

            {/* Input Box de IA */}
            <div className="space-y-3">
              <div className="relative flex items-center bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-1.5 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-400/20 transition-all">
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={e => setAiQuestion(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAskAI()}
                  placeholder="Ej. ¿Cómo está el stock físico vs comprometido? ¿Hay compras demoradas en aduana?"
                  className="w-full bg-transparent border-none px-4 py-2 text-xs font-medium text-white placeholder-slate-400 outline-none"
                />
                <button
                  onClick={() => handleAskAI()}
                  disabled={aiLoading || !aiQuestion.trim()}
                  className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {aiLoading ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                  <span>{aiLoading ? 'Pensando...' : 'Preguntar'}</span>
                </button>
              </div>

              {/* Sugerencias Rápidas */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Consultas rápidas:</span>
                {[
                  { label: 'Estado de inventario', prompt: '¿Cómo está el inventario hoy entre físico, reservado y disponible?' },
                  { label: 'Compras en tránsito', prompt: '¿Cuáles compras o PECs están en tránsito hacia bodega?' },
                  { label: 'Cartera pendiente', prompt: '¿Cuál es el saldo total pendiente de cobro en pedidos de venta?' },
                  { label: 'Resumen de clientes', prompt: 'Dame un resumen del volumen de clientes y pedidos recientes' },
                ].map((sug, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAskAI(sug.prompt)}
                    className="text-[11px] font-semibold bg-white/5 hover:bg-white/10 text-purple-200 border border-white/10 rounded-xl px-3 py-1 transition-colors"
                  >
                    {sug.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Respuesta del Copiloto */}
            {aiResponse && (
              <div className="bg-black/30 border border-purple-500/20 rounded-2xl p-5 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-[11px] text-purple-300 font-bold border-b border-white/10 pb-2">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={13} className="text-purple-400" /> Respuesta ({aiResponse.source})
                  </span>
                  <span className="text-slate-400 font-mono text-[10px]">{aiResponse.timestamp}</span>
                </div>
                <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-line font-normal">
                  {aiResponse.answer}
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* 3. FLUJO DEL INVENTARIO (ZONA CENTRAL MAESTRA NEBULAE) */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Layers className="text-purple-600" size={20} /> Flujo Canónico del Inventario
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Rastreo unificado de stock físico, reserva preventiva por anticipos y compras en ruta.
              </p>
            </div>
            <Link
              href="/dashboard/inventario"
              className="text-xs font-bold text-purple-600 hover:text-purple-800 flex items-center gap-1 self-start sm:self-auto"
            >
              Kardex Completo <ArrowRight size={13} />
            </Link>
          </div>

          <FranjaKpis estado={estadoInventario} titulo="Flujo del inventario">
            <TarjetaKpi kpi="inv_fisico" valor={existencias.fisico.valor} />
            <TarjetaKpi kpi="inv_reservado" valor={existencias.reservado.valor} />
            <TarjetaKpi kpi="inv_disponible" valor={existencias.disponible.valor} />
            <TarjetaKpi kpi="inv_en_transito" valor={existencias.en_transito.valor} ayuda={existencias.en_transito.ayuda ?? undefined} />
          </FranjaKpis>
          <AvisoDeError error={inventario.error} fallo="No se pudieron cargar las existencias" onReintentar={inventario.recargar} acento="indigo" />
          {!inventario.error && compras.error ? (
            <AvisoDeError error={compras.error} fallo="No se pudieron cargar los pedidos de compra activos" onReintentar={compras.recargar} acento="indigo" />
          ) : null}
        </div>

        {/* 4. Los 4 KPIs Vitales del Negocio */}
        <div className="space-y-3">
          <FranjaKpis estado={estadoVentas} titulo="Indicadores vitales del negocio">
            <TarjetaKpi kpi="vendido_periodo" etiqueta={etiquetaKpi('vendido_periodo', periodoDatos)} textoPeriodo={textoPeriodo}
              valor={vitales.vendido.valor} variacion={vitales.vendido.variacion} />
            <TarjetaKpi kpi="ticket_promedio" etiqueta={etiquetaKpi('ticket_promedio', periodoDatos)} textoPeriodo={textoPeriodo}
              valor={vitales.ticket.valor} variacion={vitales.ticket.variacion} />
            <TarjetaKpi kpi="pven_saldo_por_cobrar" valor={vitales.saldo.valor}
              variacion={{ actual: vitales.saldo.valor, anterior: null, es_foto: true }} />
            <TarjetaKpi kpi="clientes_total" estado={estadoClientes} valor={vitales.clientes.valor} />
          </FranjaKpis>
          <AvisoDeError error={ventas.error} fallo="No se pudieron cargar las cifras de ventas" onReintentar={ventas.recargar} acento="indigo" />
          <AvisoDeError error={clientes.error} fallo="No se pudieron contar los clientes" onReintentar={clientes.recargar} acento="indigo" />
        </div>

        {/* 5. Embudo B2B & Radar Operativo */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Embudo de Pedidos: PasosFlujo con /ventas/flujo (los mismos números de la franja del Hub); cada caja abre el Hub
              ya filtrado por ese paso (FLUJO-ventas-pantallas E). */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col min-w-0">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <BarChart3 className="text-purple-600" size={18} /> Embudo Operativo de Ventas
              </h3>
              <Link href="/dashboard/ventas" className="text-xs font-bold text-purple-700 hover:underline flex items-center">
                Ver todos <ChevronRight size={14}/>
              </Link>
            </div>
            <div className="p-5 flex-1 flex flex-col gap-3 min-w-0">
              {avisoEmbudo.visible && (
                <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                  {avisoEmbudo.texto}
                  <button type="button" onClick={() => { if (avisoEmbudo.puedeReintentar) flujo.recargar(); }} aria-disabled={avisoEmbudo.reintentando || undefined}
                    className={`rounded font-bold underline ${FOCOS.indigo}`}>
                    {avisoEmbudo.boton}
                  </button>
                </div>
              )}
              <PasosFlujo variante="banner" orientacion="vertical" etiqueta="Embudo operativo de ventas"
                pasos={pasosEmbudo} estadoConteos={franjaEmbudo.estadoConteos} />
            </div>
          </div>

          {/* Últimos Pedidos de Compra (PECs) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Truck className="text-teal-600" size={18} /> Compras & PECs Recientes
              </h3>
              <Link href="/dashboard/compras/pedidos" className="text-xs font-bold text-teal-600 hover:underline flex items-center">
                Ver todos <ChevronRight size={14}/>
              </Link>
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
              {recientes.pecsActivos.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">Sin pedidos de compra recientes</p>
              ) : (
                recientes.pecsActivos.map((pec: any) => (
                  <div key={pec.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-xs text-slate-800">{pec.numero}</p>
                      <p className="text-[10px] text-slate-400">Total: {formatCOP(pec.total_cop)}</p>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                      {infoEstadoPec(pec.estado).label}
                    </span>
                  </div>
                ))
              )}
              <Link
                href="/dashboard/compras/pedidos"
                className="w-full py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-xs rounded-xl text-center transition-colors block"
              >
                + Crear Nuevo Pedido de Compra PEC
              </Link>
            </div>
          </div>

          {/* Últimos Pedidos de Venta */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <ShoppingCart className="text-indigo-600" size={18} /> Pedidos de Venta Recientes
              </h3>
              <Link href="/dashboard/ventas/venta" className="text-xs font-bold text-indigo-600 hover:underline flex items-center">
                Ver todos <ChevronRight size={14}/>
              </Link>
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
              {recientes.pedidosRecientes.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">Sin pedidos de venta recientes</p>
              ) : (
                recientes.pedidosRecientes.map((ven: any) => (
                  <div key={ven.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-xs text-slate-800">{ven.numero}</p>
                      <p className="text-[10px] text-slate-400 truncate max-w-[140px]">{ven.customer_name || 'Cliente'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-800">{formatCOP(ven.total_cop)}</p>
                      <span className="text-[9px] font-bold text-indigo-600">{infoEstadoPedido(ven.estado).label}</span>
                    </div>
                  </div>
                ))
              )}
              <Link
                href="/dashboard/ventas/cotizacion"
                className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl text-center transition-colors block"
              >
                + Crear Nueva Cotización / Pedido
              </Link>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
