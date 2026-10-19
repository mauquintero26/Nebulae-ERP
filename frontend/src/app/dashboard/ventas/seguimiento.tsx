'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BellRing, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { recargarTrasError } from '@/lib/avisos';
import { TONES, useAvisos } from '@/components/ui';
import {
  textoSeguimiento, puedeDetener, accionDetenerSeguimiento, avisoDiasSeguimiento, opcionesHora, esAdminOAsesor,
  LIMITES_SEGUIMIENTO,
} from '@/lib/seguimiento';
import { lineaRevision, avisoSinMedios, RELECTURA_TRAS_REVISION_MS } from '@/lib/tareas';
import { getUsuarioActual } from './flujo';
import { CLASES_TONO_AVISO } from './ventana-enlace';
import { CampoNumero, CampoSelect, Interruptor, SeccionConfig } from './hub-bloque3';

// B3 T16 (U16-seguimiento puntos 8, 11 y 12; TAREAS punto 6): el recordatorio automático al cliente en pantalla.
// - TarjetaSeguimiento: el recuadro de «Siguiente paso» de la SC y la COT (lo montan T17 y T18).
// - (La línea del recordatorio de la ventana del enlace, LineaSeguimientoEnlace, vive en ventana-enlace.tsx: r1.)
// - SeccionSeguimiento: «Seguimiento de confirmación» del ConfigPanel del Hub, con el estado de la revisión automática.
// Toda la lógica y los textos vienen de lib/seguimiento.js y lib/tareas.js (probadas con node).

const CLASES_TONO: Record<'ok' | 'info' | 'alerta' | 'gris', string> = { ...CLASES_TONO_AVISO, gris: TONES.neutral };

/**
 * El recuadro del recordatorio en «Siguiente paso» (textoSeguimiento de doc.seguimiento) con «No enviar
 * recordatorios» mientras está programado. Va como bloque (div): dentro de NextStepCard, en `actions` (sus `children`
 * se pintan dentro de un <p>). onCambio recarga el documento (el «detener» deja su renglón en la Actividad).
 * r1: el botón solo para ADMIN o ASESOR (esAdminOAsesor: el POST exige esos roles, nunca un 403); la respuesta del
 * «detener» se pinta enseguida (reemplaza a doc.seguimiento hasta que llegue uno nuevo del padre) y un 400 o 409 (otro
 * usuario ya lo detuvo, el documento salió de Pendiente) también recarga.
 */
export function TarjetaSeguimiento({ tipoDoc, doc, onCambio }: {
  tipoDoc: 'SC' | 'COT';
  /** El detalle de la SC o la COT: su id y `seguimiento` (seguimiento_confirmacion.resumen(), T11). */
  doc: { id?: number | string | null; seguimiento?: unknown } | null | undefined;
  onCambio: () => void;
}) {
  const { avisarError, confirmar } = useAvisos();
  const [deteniendo, setDeteniendo] = useState(false);
  // La respuesta del «detener», atada al doc.seguimiento que reemplaza: cuando el padre trae uno nuevo, se descarta.
  const [respuesta, setRespuesta] = useState<{ de: unknown; resumen: unknown } | null>(null);
  const seguimiento = respuesta && respuesta.de === doc?.seguimiento ? respuesta.resumen : doc?.seguimiento;
  const texto = textoSeguimiento(seguimiento);
  if (!texto) return null;
  const accion = puedeDetener(seguimiento) && esAdminOAsesor(getUsuarioActual().role)
    ? accionDetenerSeguimiento(tipoDoc, doc?.id) : null;

  async function detener() {
    if (!accion || deteniendo) return;
    if (!(await confirmar({ titulo: accion.titulo, mensaje: accion.mensaje, textoConfirmar: 'No enviar recordatorios' }))) {
      return;
    }
    setDeteniendo(true);
    try {
      const r = await apiFetch(accion.ruta, { method: 'POST', body: '{}' });
      setRespuesta({ de: doc?.seguimiento, resumen: r?.data ?? null });
      onCambio();
    } catch (err) {
      avisarError(err, 'No se pudieron detener los recordatorios');
      if (recargarTrasError(err)) onCambio();
    } finally {
      setDeteniendo(false);
    }
  }

  return (
    <div role="status" className={`rounded-xl border px-3 py-2.5 text-xs ${CLASES_TONO[texto.tono]}`}>
      <div className="flex items-start gap-2">
        <BellRing size={14} className="mt-0.5 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p className="font-bold">{texto.titulo}</p>
          <p className="leading-relaxed">{texto.texto}</p>
          {accion && (
            <button type="button" onClick={detener} disabled={deteniendo}
              className="font-bold underline underline-offset-2 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed">
              No enviar recordatorios
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * «Seguimiento de confirmación» del ConfigPanel (U16-seguimiento punto 12a): los 6 valores seguimiento_* (se guardan
 * con el «Guardar Configuración» del panel), el aviso de los días de alerta y, al pie, el estado de la revisión
 * automática (TAREAS). Quien no es administrador la ve en solo lectura (N8).
 */
export function SeccionSeguimiento({ cfg, onCambio, soloLectura }: {
  cfg: Record<string, string>;
  onCambio: (clave: string, valor: string) => void;
  soloLectura: boolean;
}) {
  const aviso = avisoDiasSeguimiento(cfg);
  const [diasMin, diasMax] = LIMITES_SEGUIMIENTO.seguimiento_dias;
  const [maxMin, maxMax] = LIMITES_SEGUIMIENTO.seguimiento_max;
  return (
    <SeccionConfig titulo="Seguimiento de confirmación" icono={BellRing} tono="sky"
      descripcion="Recordatorio automático al cliente cuando una solicitud o cotización sigue en Pendiente por confirmación.">
      <Interruptor tono="sky" etiqueta="Recordar al cliente si no confirma"
        descripcion="Si una solicitud o cotización sigue sin confirmar, se le envía al cliente un recordatorio por el mismo medio, con un enlace nuevo y el correo de respaldo."
        valor={cfg.seguimiento_auto_activo === 'true'} deshabilitado={soloLectura}
        onCambio={v => onCambio('seguimiento_auto_activo', v ? 'true' : 'false')} />
      <CampoNumero tono="sky" etiqueta="Días sin respuesta antes del recordatorio" ayuda={`De ${diasMin} a ${diasMax}.`}
        valor={cfg.seguimiento_dias} min={diasMin} max={diasMax} sufijo="días" deshabilitado={soloLectura}
        onCambio={v => onCambio('seguimiento_dias', v)} />
      <CampoNumero tono="sky" etiqueta="Cuántos recordatorios" ayuda={`De ${maxMin} a ${maxMax}.`}
        valor={cfg.seguimiento_max} min={maxMin} max={maxMax} deshabilitado={soloLectura}
        onCambio={v => onCambio('seguimiento_max', v)} />
      <Interruptor tono="sky" etiqueta="Solo en horario laboral"
        descripcion={cfg.seguimiento_solo_horario === 'true'
          ? 'Lunes a sábado. Si el plazo se cumple fuera de horario, sale a la siguiente hora hábil.' : undefined}
        valor={cfg.seguimiento_solo_horario === 'true'} deshabilitado={soloLectura}
        onCambio={v => onCambio('seguimiento_solo_horario', v ? 'true' : 'false')} />
      {cfg.seguimiento_solo_horario === 'true' && (
        // r1: una columna. El Drawer mide 448 px a cualquier ancho de ventana: dos columnas por `sm:` se salían.
        <div className="space-y-3">
          <CampoSelect tono="sky" etiqueta="Desde" valor={cfg.seguimiento_hora_inicio}
            opciones={opcionesHora('seguimiento_hora_inicio')} deshabilitado={soloLectura}
            onCambio={v => onCambio('seguimiento_hora_inicio', v)} />
          <CampoSelect tono="sky" etiqueta="Hasta" valor={cfg.seguimiento_hora_fin}
            opciones={opcionesHora('seguimiento_hora_fin')} deshabilitado={soloLectura}
            onCambio={v => onCambio('seguimiento_hora_fin', v)} />
        </div>
      )}
      {aviso && (
        <p role="status" className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${TONES.warning}`}>
          <AlertTriangle size={14} className="mt-px shrink-0" /> <span>{aviso}</span>
        </p>
      )}
      <EstadoRevisionAutomatica esAdmin={!soloLectura} />
    </SeccionConfig>
  );
}

/**
 * TAREAS punto 6: el pie de la sección. Lee GET /ventas/tareas/estado al montarse (sobre {status, data}: apiFetch no lo
 * desenvuelve) y muestra la línea de lineaRevision (al día, atrasada o apagada) y el recuadro «sin medios». «Revisar
 * ahora» solo para el administrador y solo con la revisión activa en este servidor; su aviso es el `message` del 202 y
 * después se vuelve a leer el estado, y otra vez a los RELECTURA_TRAS_REVISION_MS (la revisión corre en segundo plano
 * después del 202; r1). Los errores (el 409 de «apagada») van con avisarError y también releen el estado (r1).
 */
type EstadoTareas = {
  activas_en_servidor?: boolean;
  intervalo_min?: number;
  ultima_revision?: string | null;
  resumen?: unknown;
} | null;

function EstadoRevisionAutomatica({ esAdmin }: { esAdmin: boolean }) {
  const { avisar, avisarError } = useAvisos();
  const [estado, setEstado] = useState<EstadoTareas>(null);
  const [cargado, setCargado] = useState(false);
  const [revisando, setRevisando] = useState(false);
  // Cada lectura de /tareas/estado: la de abrir el panel y la de después de «Revisar ahora».
  const [lectura, setLectura] = useState(0);
  const montado = useRef(true);
  const relectura = useRef<ReturnType<typeof setTimeout> | null>(null);
  // r1 (StrictMode de next dev): el efecto vuelve a poner montado en true al (re)montar; si no, las guardas quedaban en
  // false para siempre y el botón no salía de «revisando». La segunda lectura se cancela al desmontar.
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      if (relectura.current) clearTimeout(relectura.current);
    };
  }, []);
  const releer = () => { if (montado.current) setLectura(n => n + 1); };

  useEffect(() => {
    let vigente = true; // una respuesta vieja (o con el panel cerrado) no se pinta
    apiFetch('/ventas/tareas/estado')
      .then((r: { data?: EstadoTareas }) => { if (vigente) setEstado(r?.data ?? null); })
      .catch((err: unknown) => { console.error(err); if (vigente) setEstado(null); })
      .finally(() => { if (vigente) setCargado(true); });
    return () => { vigente = false; };
  }, [lectura]);

  async function revisarAhora() {
    setRevisando(true);
    try {
      const r = await apiFetch('/ventas/tareas/revisar-ahora', { method: 'POST', body: '{}' });
      if (r?.message) avisar(r.message);
      releer();
      if (relectura.current) clearTimeout(relectura.current);
      relectura.current = setTimeout(releer, RELECTURA_TRAS_REVISION_MS);
    } catch (err) {
      avisarError(err);
      releer();
    } finally {
      if (montado.current) setRevisando(false);
    }
  }

  if (!cargado) return <p className="text-xs text-slate-400">Consultando la revisión automática…</p>;
  const linea = lineaRevision(estado);
  if (!linea) return <p className="text-xs text-slate-400">No se pudo consultar el estado de la revisión automática.</p>;
  const sinMedios = avisoSinMedios(estado);
  return (
    <div className="space-y-2 pt-1">
      {sinMedios && (
        <p role="status" className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${TONES.warning}`}>
          <AlertTriangle size={14} className="mt-px shrink-0" /> <span>{sinMedios}</span>
        </p>
      )}
      {linea.caso === 'al_dia' ? (
        <p className="text-xs text-slate-500">{linea.texto}</p>
      ) : (
        <p role="status" className={`rounded-xl border px-3 py-2 text-xs font-semibold ${linea.caso === 'atrasada'
          ? TONES.warning : TONES.neutral}`}>
          {linea.texto}
        </p>
      )}
      {esAdmin && estado?.activas_en_servidor === true && (
        <button type="button" onClick={revisarAhora} disabled={revisando}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-50 disabled:cursor-not-allowed">
          <RefreshCw size={12} className={revisando ? 'animate-spin' : ''} /> Revisar ahora
        </button>
      )}
    </div>
  );
}
