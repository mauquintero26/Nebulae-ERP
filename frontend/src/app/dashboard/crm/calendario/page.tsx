'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Phone, Mail, Clock, AlertCircle, Search,
  MoreVertical, Activity, RefreshCw, User,
  ChevronRight, Package
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { SubNav, PageHeader, FranjaKpis, TarjetaKpi, useEstadoKpi } from '@/components/ui';
import { AvisoFuente } from '@/components/ui/AvisoFuente';
import { useRolActual } from '@/components/ui/useRolActual';
import { CRM_NAV } from '../crm-nav';
import { accesoSeguimientos, TEXTO_SIN_LEADS } from '@/lib/roles';
import { CAJA_SIN_PERMISO } from '@/lib/design-system';
import { avisoDeFuente, estadoFranjaDeFuente, motivoSinPermiso } from '@/lib/avisos';
import { formatoEntero, lecturaDeFuente, textoLimiteCarritos } from '@/lib/kpis';
import {
  datosDeSeguimiento, etapasDeSeguimiento, fichaDeLeadSeguimiento, filtrarSeguimiento, gruposDeSeguimiento, tarjetasSeguimientos,
  textoVacioLeads, vistaSeguimiento,
} from '@/lib/crm-etapas';

/** Lo último que llegó de la carga (leads y etapas juntos): la vuelta con la que se pidió, sus datos y su error (lecturaDeFuente). */
type Cargado = { vuelta: number; datos: { leads: any[]; stages: any[]; total: number } | null; error: unknown };

export default function SeguimientosPage() {
  // B4 T23B: el rol se lee después de montar (useRolActual: '' hasta entonces, y no se pide nada) y la pantalla no pide lo que el rol no
  // puede leer (accesoSeguimientos: GET /crm/leads es de ADMIN y ASESOR; un 403 fijo no se reintenta).
  const rol = useRolActual();
  const acceso = accesoSeguimientos(rol);
  const [vuelta, setVuelta] = useState(0);
  const [cargado, setCargado] = useState<Cargado | null>(null);
  const [search, setSearch] = useState('');
  const [activeStage, setActiveStage] = useState('all');
  const [selected, setSelected] = useState<any | null>(null);

  // La carga (RP7): GET /crm/leads y /crm/pipeline-stages responden {status, data, total} (antes la pantalla leía `leads` y `stages`, y el
  // apiFetch local pedía .json() de un cuerpo ya leído: nunca cargaba). limit=1000 es el tope del servidor; si hay más, se dice.
  useEffect(() => {
    if (!acceso.leads) return;
    const control = new AbortController();
    Promise.all([
      apiFetch('/crm/leads?limit=1000', { signal: control.signal }),
      apiFetch('/crm/pipeline-stages', { signal: control.signal }),
    ])
      .then(([l, s]) => setCargado({ vuelta, datos: datosDeSeguimiento(l, s), error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setCargado({ vuelta, datos: null, error: err }); });
    return () => control.abort();
  }, [vuelta, acceso.leads]);

  const { datos, cargando, error } = lecturaDeFuente(cargado, vuelta);
  const estadoKpi = useEstadoKpi(cargando, error);
  const aviso = avisoDeFuente(error, 'No se pudieron cargar los leads');
  const leads = datos?.leads ?? null;
  const stages = datos?.stages ?? null;
  const reintentar = () => setVuelta((n) => n + 1);
  const sinPermiso = motivoSinPermiso(aviso);

  // Una sola vista para las tarjetas, las pastillas y los grupos (filtrarSeguimiento): el número de cada una es el de lo que abre.
  const filtro = { q: search, etapa: activeStage };
  const tarjetas = tarjetasSeguimientos(leads, stages, filtro);
  const filtrados = filtrarSeguimiento(leads, stages, filtro);
  const grupos = gruposDeSeguimiento(leads, stages, filtro);
  const urgentes = tarjetasSeguimientos(leads, stages, {})?.total.urgentes ?? 0;
  const textoLimite = textoLimiteCarritos(datos?.total, leads === null ? null : leads.length);
  const hayEtapas = etapasDeSeguimiento(stages).length > 0;
  // Qué se pinta (función pura): el esqueleto mientras llegan, el aviso si no llegaron, el vacío o los grupos.
  const vista = vistaSeguimiento(leads, aviso, filtrados);
  const cuentaVista = (etapa: string) => (leads === null ? null : filtrarSeguimiento(leads, stages, { q: search, etapa }).length);

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">

      <SubNav label="CRM" items={CRM_NAV} currentPath="/dashboard/crm/calendario" color="indigo" />

      {/* Alert urgentes */}
      {urgentes > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-4">
          <AlertCircle className="text-amber-600 shrink-0" size={18} />
          <p className="text-xs font-bold text-amber-700 flex-1">
            De todos los leads, {urgentes === 1 ? '1 lleva' : `${formatoEntero(urgentes)} llevan`} 7 días o más sin actividad: riesgo de perder oportunidades
          </p>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-6">

        {/* Header */}
        <PageHeader icon={Phone} color="indigo"
          title="Seguimientos CRM"
          subtitle={datos ? `Gestiona el pipeline de ventas por etapa — ${formatoEntero(datos.total)} leads, sin contar los perdidos` : 'Gestiona el pipeline de ventas por etapa'}
          actions={(
            <div className="flex gap-3">
              <button onClick={reintentar} disabled={!acceso.leads} className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm disabled:opacity-50">
                <RefreshCw size={15} className={acceso.leads && cargando ? 'animate-spin' : ''} /> Actualizar
              </button>
              <Link href="/dashboard/crm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md flex items-center gap-2 text-sm">
                Ir al Kanban
              </Link>
            </div>
          )} />

        {acceso.listo && !acceso.leads ? (
          <p role="status" className={`${CAJA_SIN_PERMISO}`}>{TEXTO_SIN_LEADS}</p>
        ) : (
          <>
            {aviso && <AvisoFuente aviso={aviso} onReintentar={reintentar} />}

            {/* KPI Cards: las 3 primeras etapas (color de su clase, pulsables: abren su etapa) y el total */}
            <FranjaKpis estado={estadoFranjaDeFuente(aviso, estadoKpi)} titulo="Indicadores de Seguimientos"
              nota={textoLimite ? `${textoLimite}. La búsqueda solo filtra los cargados: para ver todos usa el Kanban.` : undefined}>
              {tarjetas
                ? tarjetas.etapas.map((e) => (
                  <TarjetaKpi key={e.clave} etiqueta={e.nombre} icono="Circle" color={e.acento} valor={e.valor} activo={e.activa}
                    onClick={() => setActiveStage(e.activa ? 'all' : e.clave)} />
                ))
                : cargando && [0, 1, 2].map((i) => <TarjetaKpi key={i} etiqueta="Etapa" icono="Circle" valor={null} />)}
              <TarjetaKpi kpi="leads_total" valor={tarjetas?.total.valor ?? null} ayuda={tarjetas?.total.ayuda ?? sinPermiso ?? undefined}
                activo={tarjetas?.total.activa} onClick={() => setActiveStage('all')} />
            </FranjaKpis>

            {/* Stage filter + Search */}
            <div className="flex gap-3 flex-wrap items-center">
              <button onClick={() => setActiveStage('all')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeStage === 'all' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                Todos{leads === null ? '' : ` (${formatoEntero(cuentaVista('all'))})`}
              </button>
              {etapasDeSeguimiento(stages).map((s: any) => (
                <button key={s.id} onClick={() => setActiveStage(String(s.id))}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeStage === String(s.id) ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-200'}`}>
                  {s.name}{leads === null ? '' : ` (${formatoEntero(cuentaVista(String(s.id)))})`}
                </button>
              ))}
              <div className="ml-auto flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm focus-within:border-indigo-400">
                <Search className="text-slate-400 mr-2" size={15} />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar cliente, producto, asesor..." aria-label="Buscar leads"
                  className="bg-transparent text-sm outline-none w-48 text-slate-700" />
              </div>
            </div>

            {/* Content */}
            {vista === 'esqueleto' ? (
              <div className="flex justify-center py-20" role="status" aria-label="Cargando leads">
                <RefreshCw size={28} className="animate-spin text-indigo-400" />
              </div>
            ) : vista === 'aviso' ? null : vista === 'vacio' ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-20 text-center shadow-sm">
                <Activity size={48} className="mx-auto mb-4 text-slate-200" />
                <p className="text-slate-500 font-semibold">{textoVacioLeads({ q: search, etapa: activeStage })}</p>
                <Link href="/dashboard/crm"
                  className="inline-flex items-center gap-2 mt-4 bg-indigo-600 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-indigo-700">
                  Ir al Kanban <ChevronRight size={14} />
                </Link>
              </div>
            ) : hayEtapas ? (
              /* Group by stage */
              <div className="space-y-6">
                {grupos.map((grupo) => {
                  if (grupo.leads.length === 0 && activeStage !== 'all') return null;
                  return (
                    <div key={grupo.clave}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: grupo.colorHex }} />
                        <h3 className="font-extrabold text-slate-700 text-lg">{grupo.nombre}</h3>
                        <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{formatoEntero(grupo.leads.length)} {grupo.leads.length === 1 ? 'lead' : 'leads'}</span>
                      </div>
                      {grupo.leads.length === 0 ? (
                        <p className="text-sm text-slate-400 italic pl-6">Sin leads en esta etapa</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {grupo.leads.map((lead: any) => {
                            const f = fichaDeLeadSeguimiento(lead);
                            return (
                              <div key={lead.id} onClick={() => setSelected(selected?.id === lead.id ? null : lead)}
                                className={`bg-white rounded-2xl border shadow-sm p-5 cursor-pointer transition-all hover:shadow-md ${
                                  selected?.id === lead.id ? 'border-indigo-400 ring-2 ring-indigo-100' : f.atrasado ? 'border-amber-200' : 'border-slate-100'
                                }`}>
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <p className="font-extrabold text-slate-900">{f.nombre}</p>
                                    {f.producto && (
                                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Package size={10}/> {f.producto}</p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    {f.valor && (
                                      <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                        {f.valor}
                                      </span>
                                    )}
                                    {f.atrasado && (
                                      <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <AlertCircle size={10}/> {f.diasTexto}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-1.5 text-xs text-slate-500">
                                  {f.descripcion && (
                                    <p className="line-clamp-2">{f.descripcion}</p>
                                  )}
                                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
                                    <span className="flex items-center gap-1 text-slate-500">
                                      <Clock size={11}/> {f.hace}
                                    </span>
                                    {f.asesor && (
                                      <span className="flex items-center gap-1 text-slate-500 font-medium">
                                        <User size={11}/> {f.asesor}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Quick actions */}
                                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                                  {f.telefono && (
                                    <a href={`tel:${f.telefono}`}
                                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-bold hover:bg-green-100" onClick={e => e.stopPropagation()}>
                                      <Phone size={11}/> Llamar
                                    </a>
                                  )}
                                  {f.correo && (
                                    <a href={`mailto:${f.correo}`}
                                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100" onClick={e => e.stopPropagation()}>
                                      <Mail size={11}/> Email
                                    </a>
                                  )}
                                  <Link href="/dashboard/crm"
                                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100" onClick={e => e.stopPropagation()}>
                                    <MoreVertical size={11}/> CRM
                                  </Link>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Fallback: simple list if no stages */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtrados.map((lead: any) => {
                  const f = fichaDeLeadSeguimiento(lead);
                  return (
                    <div key={lead.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                      <p className="font-extrabold text-slate-900">{f.nombre}</p>
                      <p className="text-xs text-slate-500 mt-1">{f.hace}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
