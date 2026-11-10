"use client";

import { useState, useEffect } from 'react';
import {
  Megaphone, Network, Sparkles, Target,
  ArrowUpRight, BarChart3, RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PageHeader, FranjaKpis, TarjetaKpi, useEstadoKpi } from '@/components/ui';
import { AvisoFuente } from '@/components/ui/AvisoFuente';
import { useRolActual } from '@/components/ui/useRolActual';
import { accesoMarketing } from '@/lib/roles';
import { avisoDeFuente, estadoFranjaDeFuente, motivoSinPermiso } from '@/lib/avisos';
import { datosDeRespuesta, lecturaDeFuente, tarjetasMarketing } from '@/lib/kpis';

/** Lo último que llegó de /marketing/stats: la vuelta con la que se pidió, sus datos y su error (lecturaDeFuente). */
type Cargado = { vuelta: number; datos: Record<string, unknown> | null; error: unknown };

/** El texto de quien no puede ver los indicadores (todo /marketing es de ADMIN y ASESOR): neutro, sin «Reintentar». */
const TEXTO_SIN_INDICADORES = 'Tu rol no ve los indicadores de Marketing.';

export default function MarketingDashboard() {
  // B4 T23B: el rol se lee después de montar y no se pide lo que no puede leer (accesoMarketing: /marketing/stats es de ADMIN y ASESOR).
  const acceso = accesoMarketing(useRolActual());
  const [vuelta, setVuelta] = useState(0);
  const [cargado, setCargado] = useState<Cargado | null>(null);

  // GET /marketing/stats con su turno: la primera vez, 'cargando' (barras grises, nunca '...' ni 0); al recargar se conserva el último
  // valor ('actualizando'); con error, «—» y el aviso con el detalle del servidor y «Reintentar» (un 403, sin «Reintentar»).
  useEffect(() => {
    if (!acceso.ver) return;
    const control = new AbortController();
    apiFetch('/marketing/stats', { signal: control.signal })
      .then((r: unknown) => setCargado({ vuelta, datos: datosDeRespuesta(r), error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setCargado({ vuelta, datos: null, error: err }); });
    return () => control.abort();
  }, [vuelta, acceso.ver]);

  const { datos, cargando, error } = lecturaDeFuente(cargado, vuelta);
  const estado = useEstadoKpi(cargando, error);
  const aviso = avisoDeFuente(error, 'No se pudieron cargar los indicadores de Marketing');
  const t = tarjetasMarketing(datos);
  const reintentar = () => setVuelta((n) => n + 1);
  const sinPermiso = motivoSinPermiso(aviso) ?? undefined;

  // «Visitantes & Leads» salió del menú (R14: su pantalla no tiene datos reales) y no se ofrece desde aquí (RP55).
  const MODULES = [
    { name: 'Flujos (Redes Sociales)', desc: 'Automatización por keyword: Instagram, WhatsApp, Facebook, Email.', path: '/dashboard/marketing/flujos', icon: Network, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { name: 'Historias & Publicaciones', desc: 'Diseña con preview de teléfono, programa y publica en redes.', path: '/dashboard/marketing/historias', icon: Sparkles, color: 'text-purple-600 bg-purple-50 border-purple-200' },
    { name: 'Campañas', path: '/dashboard/marketing/campanas', desc: 'Crea, lanza y mide campañas multicanal con código de descuento.', icon: Target, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  ];

  return (
    <div className="w-full bg-slate-50 flex flex-col px-8 py-8 min-h-max animate-in fade-in custom-scrollbar">
      <div className="mb-10">
        <PageHeader icon={Megaphone} color="purple"
          title="Centro de Marketing & Crecimiento"
          subtitle="Campañas multicanal · Flujos automáticos · Historias & Publicaciones · Leads & Conversión"
          actions={(
            <button onClick={reintentar} disabled={!acceso.ver} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold text-sm shadow-sm disabled:opacity-50">
              <RefreshCw size={14} className={acceso.ver && cargando ? 'animate-spin' : ''}/> Actualizar
            </button>
          )} />
      </div>

      <div className="mb-10 space-y-4">
        {acceso.listo && !acceso.ver ? (
          <p role="status" className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-600">{TEXTO_SIN_INDICADORES}</p>
        ) : (
          <>
            {aviso && <AvisoFuente aviso={aviso} onReintentar={reintentar} />}
            <FranjaKpis estado={estadoFranjaDeFuente(aviso, estado)} titulo="Indicadores de Marketing">
              <TarjetaKpi kpi="camp_activas" valor={t.camp_activas.valor} ayuda={t.camp_activas.ayuda ?? sinPermiso} />
              <TarjetaKpi kpi="leads_capturados" valor={t.leads_capturados.valor} ayuda={t.leads_capturados.ayuda ?? sinPermiso} />
              <TarjetaKpi kpi="ventas_atribuidas" valor={t.ventas_atribuidas.valor} ayuda={t.ventas_atribuidas.ayuda ?? sinPermiso} />
              <TarjetaKpi kpi="flujos_activos" valor={t.flujos_activos.valor} ayuda={t.flujos_activos.ayuda ?? sinPermiso} />
            </FranjaKpis>
          </>
        )}
      </div>

      <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
        <BarChart3 className="text-slate-400" size={20} /> Entornos de Marketing
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-10">
        {MODULES.map((mod, idx) => (
          <Link key={idx} href={mod.path} className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer relative overflow-hidden flex flex-col">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 border transition-transform group-hover:scale-110 ${mod.color}`}>
              <mod.icon size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2 group-hover:text-slate-900">{mod.name}</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed flex-1">{mod.desc}</p>
            <div className="absolute top-6 right-6 text-slate-300 group-hover:text-slate-800 transition-colors">
              <ArrowUpRight size={20} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
