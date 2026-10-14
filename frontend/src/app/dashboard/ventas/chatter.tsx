'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { StickyNote, Phone, MessageCircle, Mail, Handshake, Check, Send, ExternalLink } from 'lucide-react';
import { Button, useAvisos } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { waUrl } from '@/lib/whatsapp';
import { comoUTC } from '@/lib/hub-ventas';
import {
  TIPOS_CHATTER, MAX_TEXTO_CHATTER, MAX_MEDIO_CHATTER, UMBRAL_CONTADOR_CHATTER, MEDIOS_SUGERIDOS,
  esEntradaChatter, tipoChatter, tituloEntradaChatter, rutaNotas, cuerpoNota, largoTexto, entradasChatter,
  claveBorrador, claveBorradorVieja, parsearBorrador, asuntoDocumento, mailtoUrl, telUrl, motivoTelefono,
  motivoTipoDeshabilitado, mensajeNoGuardado,
} from '@/lib/chatter';
import { getUsuarioActual } from './flujo';

// U6+H22 y R1 (Bloque 2, T6B): UN solo Chatter para la Solicitud, la Cotizacion, el Pedido y el panel de actividad
// del Hub. Las paginas solo lo montan: ChatterDocumento en su pestaña Chatter (o ComposerChatter compacto en el Hub) y
// EtiquetaChatter en sus lineas de tiempo. Las reglas (tipos, validacion, cuerpo del POST, orden) viven en
// lib/chatter.js, con sus pruebas node.
// Nada de alert/confirm/prompt ni catch vacio: si una nota no se guarda, el error sale en linea (o en un aviso si el
// composer ya no esta en pantalla) y el texto se conserva, tambien en sessionStorage.

/** Documentos con Chatter (los del Hub: 'VEN' es el pedido). */
export type TipoDocChatter = 'SC' | 'COT' | 'VEN';

type Icono = React.ComponentType<{ size?: number; className?: string }>;
type Borrador = { texto: string; tipo: string; medio: string };
/** La app (WhatsApp o correo) que el navegador no dejo abrir: se ofrece un enlace manual (patron B13). */
type AppBloqueada = { url: string; nombre: string; etiqueta: string };

const TIPOS = Object.keys(TIPOS_CHATTER);
const TIPO_POR_DEFECTO = 'NOTA';
const BORRADOR_VACIO: Borrador = { texto: '', tipo: TIPO_POR_DEFECTO, medio: '' };

const ICONOS: Record<string, Icono> = {
  NOTA: StickyNote,
  LLAMADA: Phone,
  WHATSAPP: MessageCircle,
  CORREO: Mail,
  EXTERNA: Handshake,
};

// Clases completas (literales) para que Tailwind las encuentre.
const COLORES: Record<string, { chip: string; activo: string }> = {
  NOTA: { chip: 'bg-slate-100 text-slate-700 border-slate-200', activo: 'bg-slate-700 text-white border-slate-700' },
  LLAMADA: { chip: 'bg-sky-50 text-sky-700 border-sky-200', activo: 'bg-sky-600 text-white border-sky-600' },
  WHATSAPP: { chip: 'bg-green-50 text-green-700 border-green-200', activo: 'bg-green-600 text-white border-green-600' },
  CORREO: { chip: 'bg-violet-50 text-violet-700 border-violet-200', activo: 'bg-violet-600 text-white border-violet-600' },
  EXTERNA: { chip: 'bg-amber-50 text-amber-800 border-amber-200', activo: 'bg-amber-600 text-white border-amber-600' },
};

/** Fecha y hora es-CO de un renglon de Actividad (el API manda UTC; sin zona se lee como UTC). */
function fechaHora(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '';
  const d = new Date(comoUTC(iso));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Borrador en sessionStorage: si el almacenamiento falla (privado, bloqueado) el Chatter funciona igual, sin borrador.
function leerBorrador(clave: string): Borrador {
  try {
    return parsearBorrador(window.sessionStorage.getItem(clave));
  } catch {
    return parsearBorrador(null);
  }
}

function escribirBorrador(clave: string, b: Borrador): void {
  try {
    if (!b.texto && !b.medio && b.tipo === TIPO_POR_DEFECTO) window.sessionStorage.removeItem(clave);
    else window.sessionStorage.setItem(clave, JSON.stringify(b));
  } catch {
    // Sin almacenamiento: el texto sigue en pantalla, solo no sobrevive a cambiar de pestaña.
  }
}

/** La app que abre una nota de WhatsApp o Correo (con el texto ya validado), o null para los demas tipos. */
function appDeLaNota(tipo: string, doc: any, tipoDoc: TipoDocChatter, texto: string): AppBloqueada | null {
  if (tipo === 'WHATSAPP') {
    const url = waUrl(doc?.customer_phone, texto);
    return url ? { url, nombre: 'WhatsApp', etiqueta: 'Abrir WhatsApp' } : null;
  }
  if (tipo === 'CORREO') {
    const url = mailtoUrl(doc?.customer_email, asuntoDocumento(tipoDoc, doc?.numero), texto);
    return url ? { url, nombre: 'tu correo', etiqueta: 'Abrir correo' } : null;
  }
  return null;
}

/**
 * Caja para escribir una nota del Chatter (Nota interna, Llamada, WhatsApp, Correo o Nota externa con su medio).
 * Guarda con POST /ventas/{solicitudes|cotizaciones|pedidos}/{id}/actividad y llama onRegistrado con el renglon creado
 * (o null si la respuesta no lo trae: la pagina recarga el documento en silencio). Si mientras se guardaba la pagina
 * cambio de documento, no llama onRegistrado.
 */
export function ComposerChatter({ tipoDoc, doc, onRegistrado, compacto = false }: {
  tipoDoc: TipoDocChatter;
  doc: any;
  onRegistrado: (log: any | null) => void;
  compacto?: boolean;
}) {
  const { avisarError } = useAvisos();
  const id = doc?.id;
  const usuario = getUsuarioActual();
  // T11 calidad (F1): con el rol de la sesión, las chips de contacto con el cliente salen deshabilitadas para quien no
  // es ADMIN ni ASESOR (motivoTipoDeshabilitado); sin rol conocido todavía ('') no se deshabilita nada por rol.
  const rol = usuario.role;
  const clave = claveBorrador(tipoDoc, id, usuario.id ?? usuario.email);
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState(TIPO_POR_DEFECTO);
  const [medio, setMedio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bloqueo, setBloqueo] = useState<AppBloqueada | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  // WhatsApp o el correo ya se abrieron con ESTE texto: si el POST fallo, el reintento solo repite el POST.
  const [abierto, setAbierto] = useState(false);
  const guardandoRef = useRef(false);
  const montadoRef = useRef(false);
  // Clave y texto vigentes, para compararlos despues del await (el cierre de guardar() ve los de su render).
  const claveRef = useRef(clave);
  const textoRef = useRef(texto);
  const chipsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const textoId = useId();
  const medioId = useId();
  const mediosId = useId();
  const errorId = useId();
  const motivosId = useId();

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  useEffect(() => {
    textoRef.current = texto;
  }, [texto]);

  // Al montar (o al cambiar de documento o de usuario) se recupera el borrador. La clave de la primera version (sin
  // usuario) no se lee: no se sabe de quien era; solo se borra.
  useEffect(() => {
    claveRef.current = clave;
    const b = leerBorrador(clave);
    try {
      window.sessionStorage.removeItem(claveBorradorVieja(tipoDoc, id));
    } catch {
      // Sin almacenamiento: no hay nada que borrar.
    }
    setTexto(b.texto);
    setTipo(b.tipo);
    setMedio(b.medio);
    setError(null);
    setBloqueo(null);
    setAbierto(false);
  }, [clave, tipoDoc, id]);

  useEffect(() => {
    if (!guardado) return;
    const t = window.setTimeout(() => setGuardado(false), 2000);
    return () => window.clearTimeout(t);
  }, [guardado]);

  // Un tipo que el documento no admite (WhatsApp sin telefono, Correo sin correo valido) se trata como Nota interna.
  const tipoActivo = motivoTipoDeshabilitado(tipo, doc, rol) ? TIPO_POR_DEFECTO : tipo;

  if (!id) return null;

  function cambiar(cambios: Partial<Borrador>) {
    if (guardandoRef.current) return;
    const cambiaTexto = cambios.texto !== undefined && cambios.texto !== texto;
    const cambiaTipo = cambios.tipo !== undefined && cambios.tipo !== tipo;
    if (cambios.texto !== undefined) setTexto(cambios.texto);
    if (cambios.medio !== undefined) setMedio(cambios.medio);
    if (cambios.tipo !== undefined) setTipo(cambios.tipo);
    // Con otro texto u otro tipo, el proximo guardar vuelve a abrir la app con el mensaje nuevo.
    if (cambiaTexto || cambiaTipo) {
      setAbierto(false);
      setBloqueo(null);
    }
    setError(null);
    setGuardado(false);
    escribirBorrador(clave, { texto, tipo, medio, ...cambios });
  }

  /** `appYaAbierta`: el usuario abrio la app con el enlace manual (ventana bloqueada): no se vuelve a abrir. */
  async function guardar(appYaAbierta = false) {
    if (guardandoRef.current) return;
    let cuerpo: ReturnType<typeof cuerpoNota>;
    try {
      cuerpo = cuerpoNota(tipoActivo, texto, medio);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const claveEnvio = clave;
    const idEnvio = id;
    const textoEnvio = texto;
    // WhatsApp / correo: se abren ANTES del await (despues el navegador bloquea la ventana). El envio lo hace el
    // usuario; aqui queda el registro, que reinicia el atraso: por eso, si la ventana no se abrio, NO se guarda y se
    // ofrece el enlace manual.
    if (!abierto && !appYaAbierta) {
      const app = appDeLaNota(tipoActivo, doc, tipoDoc, cuerpo.description);
      if (app) {
        const ventana = window.open(app.url, '_blank');
        if (!ventana) {
          setBloqueo(app);
          setError(`El navegador no abrió ${app.nombre}. La nota todavía no se guardó: usa «${app.etiqueta}» y se guarda al abrirlo.`);
          return;
        }
        try {
          ventana.opener = null;
        } catch {
          // Ventana de otro origen ya cargada: no se puede tocar y no hace falta.
        }
        setAbierto(true);
      }
    }
    setBloqueo(null);
    guardandoRef.current = true;
    setGuardando(true);
    setError(null);
    let respuesta: any;
    try {
      respuesta = await apiFetch(rutaNotas(tipoDoc, idEnvio), { method: 'POST', body: JSON.stringify(cuerpo) });
    } catch (err) {
      // Si el composer ya no esta en pantalla (o muestra otro documento), el error va en un aviso; el texto sigue en
      // el borrador de su documento.
      if (!montadoRef.current || claveRef.current !== claveEnvio) {
        avisarError(err, 'No se guardó la nota');
      } else {
        console.error(err);
        setError(mensajeNoGuardado(err));
      }
      return;
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
    // La pagina cambio de documento mientras se guardaba: solo se limpia el borrador del documento de la nota.
    if (claveRef.current !== claveEnvio) {
      escribirBorrador(claveEnvio, BORRADOR_VACIO);
      return;
    }
    if (textoRef.current === textoEnvio) {
      setTexto('');
      setMedio('');
      setTipo(TIPO_POR_DEFECTO);
      escribirBorrador(claveEnvio, BORRADOR_VACIO);
    }
    setAbierto(false);
    setGuardado(true);
    onRegistrado(respuesta?.data ?? null);
  }

  // Flechas, Inicio y Fin mueven la seleccion entre los chips habilitados (patron radiogroup).
  const habilitados = TIPOS.filter((t) => !motivoTipoDeshabilitado(t, doc, rol));
  function teclaChip(e: React.KeyboardEvent<HTMLButtonElement>, t: string) {
    if (!habilitados.length) return;
    const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    let destino: string | undefined;
    if (paso) {
      const i = habilitados.indexOf(t);
      destino = habilitados[(i + paso + habilitados.length) % habilitados.length];
    } else if (e.key === 'Home') destino = habilitados[0];
    else if (e.key === 'End') destino = habilitados[habilitados.length - 1];
    if (!destino) return;
    e.preventDefault();
    cambiar({ tipo: destino });
    chipsRef.current[destino]?.focus();
  }

  const info = TIPOS_CHATTER[tipoActivo];
  const largo = largoTexto(texto);
  const motivos = TIPOS.map((t) => [t, motivoTipoDeshabilitado(t, doc, rol)] as const).filter(([, m]) => !!m);
  const llamar = tipoActivo === 'LLAMADA' ? telUrl(doc?.customer_phone) : null;
  const sinLlamar = tipoActivo === 'LLAMADA' && !llamar ? motivoTelefono(doc?.customer_phone) : null;
  const ayudaApp = tipoActivo === 'WHATSAPP'
    ? 'Se abre WhatsApp con este mensaje para que lo envíes tú; aquí queda el registro.'
    : tipoActivo === 'CORREO'
      ? 'Se abre tu correo con este mensaje para que lo envíes tú; aquí queda el registro.'
      : null;

  return (
    <div className={compacto ? 'space-y-2' : 'space-y-3'}>
      <div>
        <p className={`${compacto ? 'text-xs' : 'text-sm'} font-black text-slate-800`}>Notas internas y seguimiento</p>
        <p className="text-xs text-slate-600">Solo las ve tu equipo: el cliente no recibe lo que guardes aquí.</p>
      </div>

      <div role="radiogroup" aria-label="Tipo de nota" className="flex flex-wrap gap-1.5">
        {TIPOS.map((t) => {
          const IconoTipo = ICONOS[t];
          const motivo = motivoTipoDeshabilitado(t, doc, rol);
          const activo = t === tipoActivo;
          return (
            <button
              key={t}
              ref={(el) => {
                chipsRef.current[t] = el;
              }}
              type="button"
              role="radio"
              aria-checked={activo}
              aria-disabled={motivo ? true : undefined}
              aria-describedby={motivo ? `${motivosId}-${t}` : undefined}
              tabIndex={activo ? 0 : -1}
              onClick={() => { if (!motivo) cambiar({ tipo: t }); }}
              onKeyDown={(e) => teclaChip(e, t)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors ${
                activo ? COLORES[t].activo : COLORES[t].chip} ${motivo ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-sm'}`}
            >
              <IconoTipo size={12} />
              {TIPOS_CHATTER[t].chip}
            </button>
          );
        })}
      </div>
      {motivos.length > 0 && (
        <ul className="text-xs text-slate-500 space-y-0.5">
          {motivos.map(([t, m]) => (
            <li key={t} id={`${motivosId}-${t}`}>{TIPOS_CHATTER[t].chip}: {m}</li>
          ))}
        </ul>
      )}

      {tipoActivo === 'EXTERNA' && (
        <div>
          <label htmlFor={medioId} className="text-xs font-bold text-slate-600">Medio (opcional)</label>
          <input
            id={medioId}
            list={mediosId}
            value={medio}
            maxLength={MAX_MEDIO_CHATTER}
            readOnly={guardando}
            onChange={(e) => cambiar({ medio: e.target.value })}
            placeholder="Visita, Reunión, Mensaje de texto…"
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
          />
          <datalist id={mediosId}>
            {MEDIOS_SUGERIDOS.map((m) => <option key={m} value={m} />)}
          </datalist>
          <p className="mt-1 text-xs text-slate-500">
            Registra un contacto con el cliente por cualquier medio: reinicia el conteo de atraso del documento.
          </p>
        </div>
      )}
      {ayudaApp && <p className="text-xs text-slate-500">{ayudaApp}</p>}
      {llamar && (
        <a href={llamar} className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:underline">
          <Phone size={12} /> Llamar ahora
        </a>
      )}
      {sinLlamar && (
        <p className="text-xs text-slate-500">{sinLlamar}: puedes registrar igual una llamada hecha desde otro teléfono.</p>
      )}

      <div>
        <label htmlFor={textoId} className="sr-only">Texto de la nota ({info.titulo})</label>
        <textarea
          id={textoId}
          value={texto}
          rows={compacto ? 2 : 3}
          maxLength={MAX_TEXTO_CHATTER}
          readOnly={guardando}
          placeholder={info.placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => cambiar({ texto: e.target.value })}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              void guardar();
            }
          }}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-y focus:ring-2 focus:ring-indigo-200 outline-none"
        />
        {largo >= UMBRAL_CONTADOR_CHATTER && (
          <p className={`text-right text-xs ${largo > MAX_TEXTO_CHATTER ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
            {largo}/{MAX_TEXTO_CHATTER}
          </p>
        )}
      </div>

      {error && (
        <div id={errorId} role="alert" className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 space-y-2">
          <p>{error}</p>
          {bloqueo && (
            <a
              href={bloqueo.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setAbierto(true);
                setBloqueo(null);
                void guardar(true);
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-1.5 text-xs font-bold ${
                bloqueo.etiqueta === 'Abrir WhatsApp'
                  ? 'border-green-200 text-green-700 hover:bg-green-50'
                  : 'border-violet-200 text-violet-700 hover:bg-violet-50'}`}
            >
              <ExternalLink size={12} /> {bloqueo.etiqueta}
            </a>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
          {guardado && (
            <>
              <Check size={12} /> Guardado
            </>
          )}
        </span>
        {!compacto && <span className="text-[11px] text-slate-500">Ctrl + Enter para guardar</span>}
        <Button color="indigo" size="sm" icon={Send} loading={guardando} disabled={!texto.trim()} onClick={() => void guardar()}>
          {abierto ? 'Reintentar guardar' : info.boton}
        </Button>
      </div>
    </div>
  );
}

/** Notas del Chatter del documento, la mas reciente primero, con su tipo, autor y fecha. */
export function ListaChatter({ actividades }: { actividades: any }) {
  const notas = entradasChatter(actividades);
  return (
    // pb-24: la burbuja fija del asistente (bottom-6 right-6) no tapa la ultima nota.
    <div className="space-y-2 pb-24">
      {notas.length === 0 ? (
        <p className="text-sm text-slate-500 italic text-center py-8">Todavía no hay notas. Escribe la primera arriba.</p>
      ) : (
        notas.map((a: any, i: number) => {
          const tipo = tipoChatter(a);
          const IconoTipo = ICONOS[tipo];
          return (
            <article key={a.id ?? `nota-${i}`} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${COLORES[tipo].chip}`}>
                  <IconoTipo size={11} />
                </span>
                {tituloEntradaChatter(a)}
              </div>
              <p className="mt-1.5 text-sm text-slate-800 whitespace-pre-wrap break-words">{a.description}</p>
              <p className="mt-1 text-xs text-slate-500">
                {[a.user_name, fechaHora(a.created_at)].filter(Boolean).join(' · ')}
              </p>
            </article>
          );
        })
      )}
    </div>
  );
}

/**
 * Contenido de la pestaña Chatter de la SC, la COT y el PVEN: la caja ARRIBA (asi la burbuja del asistente, abajo a la
 * derecha, no tapa el boton de guardar) y la lista debajo. T11 (V4): la caja va en el flujo normal, ya no sticky: al
 * desplazar el panel quedaba encima de la lista y el boton «Guardar nota» tapaba el texto de abajo (a 1024 px).
 */
export function ChatterDocumento({ tipoDoc, doc, onRegistrado }: {
  tipoDoc: TipoDocChatter;
  doc: any;
  onRegistrado: (log: any | null) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="bg-white border-b border-slate-100 pb-3 mb-3">
        <ComposerChatter tipoDoc={tipoDoc} doc={doc} onRegistrado={onRegistrado} />
      </div>
      <ListaChatter actividades={doc?.actividades} />
    </div>
  );
}

/** Chip con el icono y el titulo del tipo de nota, para las lineas de tiempo de Actividad. null si no es una nota. */
export function EtiquetaChatter({ actividad }: { actividad: any }) {
  if (!esEntradaChatter(actividad)) return null;
  const tipo = tipoChatter(actividad);
  const IconoTipo = ICONOS[tipo];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${COLORES[tipo].chip}`}>
      <IconoTipo size={11} />
      {tituloEntradaChatter(actividad)}
    </span>
  );
}
