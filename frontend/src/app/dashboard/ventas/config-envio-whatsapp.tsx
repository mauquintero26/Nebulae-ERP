'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, MessageCircle, PlugZap, Save } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { textoDeError } from '@/lib/avisos';
import { copiarTexto } from '@/lib/copiar';
import { TONES, useAvisos } from '@/components/ui';
import {
  estadoConfigWhatsApp, resultadoPruebaWhatsApp, variablesDeEjemplo, lineaEnvioAutomatico, formularioEnvioWhatsApp,
  cuerpoEnvioWhatsApp, hayCambiosWhatsApp,
} from '@/lib/envio-whatsapp';
import { Interruptor, SeccionConfig } from './hub-bloque3';

// B3 T16 (U16-envio punto 16, C15, hueco 4): la sección «Envío automático por WhatsApp» del ConfigPanel del Hub.
// - Administrador: interruptor, número de la bandeja de Chatwoot, nombres de las dos plantillas de Meta e idioma, con
//   sus propios botones «Probar conexión» y «Guardar» (PUT /ventas/envio-cliente/whatsapp/config, todo o nada, 422 en
//   español; NO se guarda con el «Guardar Configuración» del panel). Dice si el servidor tiene la conexión con Chatwoot
//   (nunca la muestra) y qué falta, y trae el texto de las dos plantillas para crearlas en Meta, con Copiar.
// - Los demás (N8): una sola línea, «Envío automático por WhatsApp: encendido/apagado» (GET …/whatsapp/estado).
// Lógica y textos en lib/envio-whatsapp.js. El token de Chatwoot vive solo en el servidor (R18).

export function ConfigEnvioWhatsApp({ soloLectura }: { soloLectura: boolean }) {
  return soloLectura ? <LineaEnvioWhatsapp /> : <FormularioEnvioWhatsapp />;
}

/** N8: la línea de solo lectura. Si el rol no puede leer el estado (403) o falla, no se muestra nada. */
function LineaEnvioWhatsapp() {
  const [linea, setLinea] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    apiFetch('/ventas/envio-cliente/whatsapp/estado')
      .then((r: { data?: unknown }) => { if (vigente) setLinea(lineaEnvioAutomatico(r?.data)); })
      .catch((err: unknown) => { console.error(err); });
    return () => { vigente = false; };
  }, []);
  if (!linea) return null;
  return (
    <p className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-bold text-green-800">
      <MessageCircle size={16} className="text-green-600 shrink-0" /> {linea}
    </p>
  );
}

const CAMPO = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-200 '
  + 'disabled:bg-slate-50 disabled:text-slate-500';

/** El `data` de GET/PUT /ventas/envio-cliente/whatsapp/config (envio_whatsapp.config_para_admin). */
type ConfigWhatsApp = {
  categoria?: string;
  texto_plantilla?: string;
  texto_plantilla_recordatorio?: string;
  ejemplo_parametros?: unknown;
  ejemplo_parametros_recordatorio?: unknown;
  [clave: string]: unknown;
};

function FormularioEnvioWhatsapp() {
  const { avisar } = useAvisos();
  const [cfg, setCfg] = useState<ConfigWhatsApp | null>(null);
  const [form, setForm] = useState(() => formularioEnvioWhatsApp(null));
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // Cada lectura de la configuración: la de abrir el panel y la de «Reintentar».
  const [intento, setIntento] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<ReturnType<typeof resultadoPruebaWhatsApp>>(null);
  const [errorPrueba, setErrorPrueba] = useState<string | null>(null);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  useEffect(() => {
    let vigente = true; // una respuesta vieja (o con el panel cerrado) no se pinta
    apiFetch('/ventas/envio-cliente/whatsapp/config')
      .then((r: { data?: ConfigWhatsApp }) => {
        if (!vigente) return;
        setCfg(r?.data ?? null);
        setForm(formularioEnvioWhatsApp(r?.data));
      })
      .catch((err: unknown) => {
        if (vigente) setErrorCarga(textoDeError(err, 'No se pudo cargar el envío automático por WhatsApp'));
      });
    return () => { vigente = false; };
  }, [intento]);

  function reintentar() {
    setErrorCarga(null);
    setIntento(n => n + 1);
  }

  const cambiar = (campo: keyof typeof form, valor: string | boolean) => {
    setForm(f => ({ ...f, [campo]: valor }));
    setError(null);
  };
  const hayCambios = hayCambiosWhatsApp(form, cfg);
  const estado = estadoConfigWhatsApp(cfg);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await apiFetch('/ventas/envio-cliente/whatsapp/config', {
        method: 'PUT', body: JSON.stringify(cuerpoEnvioWhatsApp(form)),
      });
      if (!montado.current) return;
      setCfg(r?.data ?? null);
      setForm(formularioEnvioWhatsApp(r?.data));
      setPrueba(null);
      avisar('Envío automático por WhatsApp guardado');
    } catch (err) {
      if (montado.current) setError(textoDeError(err));
    } finally {
      if (montado.current) setGuardando(false);
    }
  }

  async function probar() {
    setProbando(true);
    setErrorPrueba(null);
    setPrueba(null);
    try {
      const r = await apiFetch('/ventas/envio-cliente/whatsapp/probar', { method: 'POST', body: '{}' });
      if (montado.current) setPrueba(resultadoPruebaWhatsApp(r?.data));
    } catch (err) {
      if (montado.current) setErrorPrueba(textoDeError(err, 'No se pudo probar la conexión'));
    } finally {
      if (montado.current) setProbando(false);
    }
  }

  if (errorCarga) {
    return (
      <SeccionConfig titulo="Envío automático por WhatsApp" icono={MessageCircle} tono="green">
        <p role="alert" className="text-xs font-semibold text-rose-700">{errorCarga}</p>
        <button type="button" onClick={reintentar} className="text-xs font-bold text-green-700 underline underline-offset-2">
          Reintentar
        </button>
      </SeccionConfig>
    );
  }
  if (!cfg) {
    return (
      <SeccionConfig titulo="Envío automático por WhatsApp" icono={MessageCircle} tono="green">
        <p className="text-xs text-slate-500">Cargando…</p>
      </SeccionConfig>
    );
  }

  return (
    <SeccionConfig titulo="Envío automático por WhatsApp" icono={MessageCircle} tono="green"
      descripcion="Manda el enlace al cliente desde el WhatsApp de la empresa por medio de Chatwoot. Esta sección se guarda con su propio botón.">
      {estado && (
        <div className="space-y-2">
          <p className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${estado.servidor.ok
            ? TONES.success : TONES.warning}`}>
            {estado.servidor.ok ? <CheckCircle2 size={14} className="mt-px shrink-0" />
              : <AlertTriangle size={14} className="mt-px shrink-0" />}
            <span>{estado.servidor.texto}</span>
          </p>
          {estado.faltan.length > 0 && (
            <div className={`rounded-xl border px-3 py-2 text-xs ${TONES.warning}`}>
              <p className="font-bold">Falta para que el envío automático funcione:</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {estado.faltan.map(f => <li key={f}>{f}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <Interruptor tono="green" etiqueta="Enviar automáticamente por WhatsApp"
        descripcion="Apagado, al enviar por WhatsApp se abre WhatsApp en el computador del asesor, como hoy."
        valor={form.automatico} deshabilitado={guardando} onCambio={v => cambiar('automatico', v)} />

      <div className="bg-white rounded-xl border border-green-100 p-4 space-y-3">
        <label className="block">
          <span className="block text-sm font-bold text-slate-700">Número de la bandeja de WhatsApp en Chatwoot</span>
          <span className="block text-xs text-slate-500 mb-1">El número de la bandeja (inbox) de WhatsApp Business en Chatwoot.</span>
          <input inputMode="numeric" value={form.inbox_id} disabled={guardando} onChange={e => cambiar('inbox_id', e.target.value)}
            placeholder="Ej.: 3" className={CAMPO} />
        </label>
        <label className="block">
          <span className="block text-sm font-bold text-slate-700">Nombre de la plantilla del documento</span>
          <span className="block text-xs text-slate-500 mb-1">El nombre exacto con que Meta aprobó la plantilla «documento».</span>
          <input value={form.plantilla} disabled={guardando} onChange={e => cambiar('plantilla', e.target.value)}
            placeholder="Ej.: documento_cliente" className={`${CAMPO} font-mono`} />
        </label>
        <label className="block">
          <span className="block text-sm font-bold text-slate-700">Nombre de la plantilla del recordatorio</span>
          <span className="block text-xs text-slate-500 mb-1">El nombre exacto con que Meta aprobó la plantilla «recordatorio».</span>
          <input value={form.plantilla_recordatorio} disabled={guardando}
            onChange={e => cambiar('plantilla_recordatorio', e.target.value)}
            placeholder="Ej.: recordatorio_confirmacion" className={`${CAMPO} font-mono`} />
        </label>
        <label className="block">
          <span className="block text-sm font-bold text-slate-700">Idioma de las plantillas</span>
          <span className="block text-xs text-slate-500 mb-1">El código de Meta, por ejemplo es o es_CO.</span>
          <input value={form.idioma} disabled={guardando} onChange={e => cambiar('idioma', e.target.value)}
            className={`${CAMPO} font-mono w-32`} />
        </label>
      </div>

      <div className="space-y-2">
        {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
        {hayCambios && <p className="text-xs text-slate-500">«Probar conexión» usa lo guardado: guarda primero los cambios.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={probar} disabled={probando || guardando || hayCambios}
            className="inline-flex items-center gap-1.5 rounded-xl border border-green-200 bg-white px-4 py-2 text-xs font-bold text-green-700 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed">
            <PlugZap size={14} className={probando ? 'animate-pulse' : ''} /> {probando ? 'Probando…' : 'Probar conexión'}
          </button>
          <button type="button" onClick={guardar} disabled={guardando || !hayCambios}
            className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <Save size={14} /> {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
        {errorPrueba && <p role="alert" className="text-xs font-semibold text-rose-700">{errorPrueba}</p>}
        {prueba && (
          <div role="status" className={`rounded-xl border px-3 py-2 text-xs ${prueba.tono === 'ok' ? TONES.success : TONES.warning}`}>
            {prueba.lineas.map((l, i) => <p key={i} className={i === 0 ? 'font-bold' : ''}>{l}</p>)}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-green-100 p-4 space-y-4">
        <div>
          <p className="text-sm font-bold text-slate-800">Texto para crear la plantilla en Meta</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Categoría: Utilidad{cfg.categoria ? ` (${cfg.categoria})` : ''} · Idioma: Español. Cuando Meta apruebe cada
            una, escribe su nombre arriba.
          </p>
        </div>
        <TextoPlantilla titulo="Plantilla del documento (solicitud, cotización y pedido)" texto={cfg.texto_plantilla}
          ejemplo={cfg.ejemplo_parametros} />
        <TextoPlantilla titulo="Plantilla del recordatorio" texto={cfg.texto_plantilla_recordatorio}
          ejemplo={cfg.ejemplo_parametros_recordatorio} />
      </div>
    </SeccionConfig>
  );
}

/** C15: una plantilla con su texto, Copiar (copiar.js de H30: nunca falla en silencio) y el ejemplo de sus variables. */
function TextoPlantilla({ titulo, texto, ejemplo }: { titulo: string; texto?: string | null; ejemplo?: unknown }) {
  const [copia, setCopia] = useState<'idle' | 'copiado' | 'manual'>('idle');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);
  if (!texto) return null;
  const variables = variablesDeEjemplo(ejemplo);

  function seleccionar() {
    const el = areaRef.current;
    if (!el) return false;
    el.focus();
    el.select();
    return true;
  }

  async function copiar() {
    const r = await copiarTexto(texto || '', {
      portapapeles: typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
      copiarSeleccion: () => seleccionar() && document.execCommand('copy'),
    });
    if (temporizador.current) clearTimeout(temporizador.current);
    if (r === 'copiado') {
      setCopia('copiado');
      temporizador.current = setTimeout(() => setCopia(e => (e === 'copiado' ? 'idle' : e)), 2000);
    } else {
      setCopia('manual');
      seleccionar();
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-700">{titulo}</p>
        <button type="button" onClick={copiar}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50">
          {copia === 'copiado' ? <Check size={12} /> : <Copy size={12} />} {copia === 'copiado' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <textarea ref={areaRef} readOnly value={texto} rows={4} onFocus={e => e.currentTarget.select()}
        className={`w-full resize-none rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-700 outline-none ${copia === 'manual'
          ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-200'}`} />
      {copia === 'manual' && (
        <p role="status" className={`rounded-lg border px-2.5 py-1.5 text-xs ${TONES.warning}`}>
          No se pudo copiar automáticamente. El texto quedó seleccionado: cópialo con Ctrl+C.
        </p>
      )}
      {variables.length > 0 && (
        <p className="text-[11px] text-slate-500">
          Ejemplo para Meta: {variables.map(v => `${v.variable} ${v.valor}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
