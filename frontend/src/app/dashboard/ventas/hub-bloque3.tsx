'use client';
import { FileText, Percent, ToggleLeft, ToggleRight } from 'lucide-react';
import { accionBloque3 } from '@/lib/acciones-bloque3';
import { TARIFAS_IVA } from '@/lib/iva';
import { DIAS_VALIDEZ_COTIZACION } from '@/lib/listas-ventas';
import { TEXTO_REENVIAR_AL_CLIENTE } from '@/lib/envio-whatsapp';

// B3 T16: piezas nuevas del Hub de Ventas (ventas/page.tsx) para que page.tsx, que está en máxima protección (R15), solo
// las cablee: las secciones «Documentos para el cliente» e «IVA» del ConfigPanel (C23), los campos que comparten con
// «Seguimiento de confirmación» (seguimiento.tsx) y «Envío automático por WhatsApp» (config-envio-whatsapp.tsx), y la
// etiqueta de las acciones del Bloque 3 en el ActivitiesPanel (RP22). Modo claro, con el estilo de las secciones que
// ya tenía el panel (Alertas de No Resolución, Automatizaciones Comerciales).

export type TonoSeccion = 'blue' | 'emerald' | 'sky' | 'green';

// Clases completas (no interpoladas) para que Tailwind las genere.
const SECCION: Record<TonoSeccion, { caja: string; icono: string; titulo: string; texto: string; fila: string }> = {
  blue:    { caja: 'bg-blue-50 border-blue-200',       icono: 'text-blue-600',    titulo: 'text-blue-800',    texto: 'text-blue-700',    fila: 'border-blue-100' },
  emerald: { caja: 'bg-emerald-50 border-emerald-200', icono: 'text-emerald-600', titulo: 'text-emerald-800', texto: 'text-emerald-700', fila: 'border-emerald-100' },
  sky:     { caja: 'bg-sky-50 border-sky-200',         icono: 'text-sky-600',     titulo: 'text-sky-800',     texto: 'text-sky-700',     fila: 'border-sky-100' },
  green:   { caja: 'bg-green-50 border-green-200',     icono: 'text-green-600',   titulo: 'text-green-800',   texto: 'text-green-700',   fila: 'border-green-100' },
};

const FILA = 'bg-white rounded-xl border';
/**
 * El estilo de los campos del ConfigPanel (el de los días de alerta: text-sm, negrita, py-1), para que todos los campos
 * de las secciones se vean iguales (r1: también los de «Envío automático por WhatsApp»).
 */
export const CONTROL = 'border border-slate-200 rounded-lg text-sm font-bold py-1 outline-none focus:ring-2 '
  + 'focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed';

/** Una sección del ConfigPanel: caja de color con su ícono, título en mayúsculas, descripción y sus filas. */
export function SeccionConfig({ titulo, icono: Icono, tono, descripcion, children }: {
  titulo: string;
  icono: React.ComponentType<{ size?: number; className?: string }>;
  tono: TonoSeccion;
  descripcion?: React.ReactNode;
  children: React.ReactNode;
}) {
  const s = SECCION[tono];
  return (
    <section className={`border rounded-2xl p-5 ${s.caja}`} aria-label={titulo}>
      <div className="flex items-center gap-2 mb-1">
        <Icono size={16} className={s.icono} />
        <h3 className={`font-black text-sm uppercase tracking-wide ${s.titulo}`}>{titulo}</h3>
      </div>
      {descripcion && <p className={`text-xs mb-4 ${s.texto}`}>{descripcion}</p>}
      <div className={`space-y-3 ${descripcion ? '' : 'mt-3'}`}>{children}</div>
    </section>
  );
}

// Revisión final B3 (F2, M15): `idError` en los tres campos es el id del error que dice que ESTE campo falló al guardar
// (el pie del ConfigPanel): el control lleva aria-invalid y queda ligado a ese texto. Sin él, como siempre.

/** Fila con un número (días, cantidad) a la derecha. */
export function CampoNumero({ etiqueta, ayuda, valor, min, max, sufijo, onCambio, deshabilitado, tono = 'blue', idError }: {
  etiqueta: string;
  ayuda?: string;
  valor: string;
  min: number;
  max: number;
  sufijo?: string;
  onCambio: (valor: string) => void;
  deshabilitado: boolean;
  tono?: TonoSeccion;
  idError?: string;
}) {
  return (
    <label className={`flex items-center justify-between gap-3 p-3 ${FILA} ${SECCION[tono].fila}`}>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-700">{etiqueta}</span>
        {ayuda && <span className="block text-xs text-slate-500 mt-0.5">{ayuda}</span>}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        <input type="number" inputMode="numeric" min={min} max={max} step={1} value={valor} disabled={deshabilitado}
          aria-invalid={idError ? true : undefined} aria-describedby={idError}
          onChange={e => onCambio(e.target.value)} className={`w-16 text-center ${CONTROL}`} />
        {sufijo && <span className="text-xs text-slate-500 font-medium">{sufijo}</span>}
      </span>
    </label>
  );
}

/**
 * Fila con un select: la etiqueta arriba y el select debajo, a todo el ancho (r1: el Drawer mide 448 px a cualquier
 * ancho de ventana, y al lado de la etiqueta un select largo se salía del panel).
 */
export function CampoSelect({ etiqueta, ayuda, valor, opciones, onCambio, deshabilitado, tono = 'blue', idError }: {
  etiqueta: string;
  ayuda?: string;
  valor: string;
  opciones: { valor: string; etiqueta: string }[];
  onCambio: (valor: string) => void;
  deshabilitado: boolean;
  tono?: TonoSeccion;
  idError?: string;
}) {
  return (
    <label className={`block space-y-2 p-3 ${FILA} ${SECCION[tono].fila}`}>
      <span className="block min-w-0">
        <span className="block text-sm font-bold text-slate-700">{etiqueta}</span>
        {ayuda && <span className="block text-xs text-slate-500 mt-0.5">{ayuda}</span>}
      </span>
      <select value={valor} disabled={deshabilitado} onChange={e => onCambio(e.target.value)}
        aria-invalid={idError ? true : undefined} aria-describedby={idError}
        className={`w-full min-w-0 px-2 bg-white ${CONTROL}`}>
        {opciones.map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
      </select>
    </label>
  );
}

/** Interruptor ON/OFF, con el mismo aspecto que los Toggle de «Automatizaciones Comerciales». */
export function Interruptor({ etiqueta, descripcion, valor, onCambio, deshabilitado, tono = 'blue', idError }: {
  etiqueta: string;
  descripcion?: string;
  valor: boolean;
  onCambio: (valor: boolean) => void;
  deshabilitado: boolean;
  tono?: TonoSeccion;
  idError?: string;
}) {
  return (
    <div className={`${FILA} p-4 ${SECCION[tono].fila}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-sm text-slate-800">{etiqueta}</p>
          {descripcion && <p className="text-xs text-slate-500 mt-0.5">{descripcion}</p>}
        </div>
        <button type="button" role="switch" aria-checked={valor} aria-label={etiqueta} disabled={deshabilitado}
          aria-invalid={idError ? true : undefined} aria-describedby={idError}
          onClick={() => onCambio(!valor)}
          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors shrink-0 disabled:cursor-not-allowed disabled:opacity-60 ${valor
            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
            : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
          {valor ? <ToggleRight size={16} className="text-emerald-600" /> : <ToggleLeft size={16} />}
          {valor ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}

type PropsSeccion = {
  cfg: Record<string, string>;
  onCambio: (clave: string, valor: string) => void;
  soloLectura: boolean;
};

/** U22-validez punto 7: «Documentos para el cliente» con los días de validez de una cotización (1 a 60, 5). */
export function SeccionDocumentosCliente({ cfg, onCambio, soloLectura }: PropsSeccion) {
  return (
    <SeccionConfig titulo="Documentos para el cliente" icono={FileText} tono="blue"
      descripcion={`La cotización que recibe el cliente dice hasta cuándo es válida, y su enlace sirve hasta ese día. «${TEXTO_REENVIAR_AL_CLIENTE}» renueva la validez; el recordatorio no.`}>
      <CampoNumero etiqueta="Días de validez de una cotización" ayuda={`De ${DIAS_VALIDEZ_COTIZACION.minimo} a ${DIAS_VALIDEZ_COTIZACION.maximo} días.`}
        valor={cfg.dias_validez_cotizacion} min={DIAS_VALIDEZ_COTIZACION.minimo} max={DIAS_VALIDEZ_COTIZACION.maximo}
        sufijo="días" onCambio={v => onCambio('dias_validez_cotizacion', v)} deshabilitado={soloLectura} />
    </SeccionConfig>
  );
}

const OPCIONES_IVA = TARIFAS_IVA.map((t: { codigo: string; etiqueta: string }) => ({ valor: t.codigo, etiqueta: t.etiqueta }));

/** IVA-PRODUCTO punto 10: la tarjeta «IVA» con la tarifa por defecto (19% inicial, R8). */
export function SeccionIva({ cfg, onCambio, soloLectura }: PropsSeccion) {
  return (
    <SeccionConfig titulo="IVA" icono={Percent} tono="emerald">
      <CampoSelect etiqueta="Tarifa de IVA por defecto" tono="emerald"
        ayuda="Se usa en los productos sin tarifa y en los productos escritos a mano en la cotización."
        valor={cfg.iva_tarifa_defecto} opciones={OPCIONES_IVA} onCambio={v => onCambio('iva_tarifa_defecto', v)}
        deshabilitado={soloLectura} />
    </SeccionConfig>
  );
}

/** RP22: la etiqueta (ícono y nombre de ACCIONES_BLOQUE3) de una acción del Bloque 3 en el ActivitiesPanel del Hub. */
export function EtiquetaAccionBloque3({ action }: { action?: string | null }) {
  const accion = accionBloque3(action);
  if (!accion) return null;
  const Icono = accion.icono;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${accion.clases}`}>
      <Icono size={11} /> {accion.etiqueta}
    </span>
  );
}
