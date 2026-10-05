'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { StickyNote, Phone, MessageCircle, Mail, Handshake, Check, Send } from 'lucide-react';
import { Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { waUrl } from '@/lib/whatsapp';
import { comoUTC } from '@/lib/hub-ventas';
import {
  TIPOS_CHATTER, MAX_TEXTO_CHATTER, MAX_MEDIO_CHATTER, UMBRAL_CONTADOR_CHATTER, MEDIOS_SUGERIDOS,
  esEntradaChatter, tipoChatter, tituloEntradaChatter, rutaNotas, cuerpoNota, largoTexto, entradasChatter,
  claveBorrador, parsearBorrador, asuntoDocumento, mailtoUrl, telUrl, motivoTipoDeshabilitado, mensajeNoGuardado,
} from '@/lib/chatter';

// U6+H22 y R1 (Bloque 2, T6B): UN solo Chatter para la Solicitud, la Cotizacion, el Pedido y el panel de actividad
// del Hub. Las paginas solo lo montan: ChatterDocumento en su pestaña Chatter (o ComposerChatter compacto en el Hub) y
// EtiquetaChatter en sus lineas de tiempo. Las reglas (tipos, validacion, cuerpo del POST, orden) viven en
// lib/chatter.js, con sus pruebas node.
// Nada de alert/confirm/prompt ni catch vacio: si una nota no se guarda, el error sale en linea y el texto se conserva
// (tambien en sessionStorage, para que sobreviva a cambiar de pestaña).

/** Documentos con Chatter (los del Hub: 'VEN' es el pedido). */
export type TipoDocChatter = 'SC' | 'COT' | 'VEN';

type Icono = React.ComponentType<{ size?: number; className?: string }>;
type Borrador = { texto: string; tipo: string; medio: string };

const TIPOS = Object.keys(TIPOS_CHATTER);
const TIPO_POR_DEFECTO = 'NOTA';

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

/**
 * Caja para escribir una nota del Chatter (Nota interna, Llamada, WhatsApp, Correo o Nota externa con su medio).
 * Guarda con POST /ventas/{solicitudes|cotizaciones|pedidos}/{id}/actividad y llama onRegistrado con el renglon creado
 * (o null si la respuesta no lo trae: la pagina recarga el documento en silencio).
 */
export function ComposerChatter({ tipoDoc, doc, onRegistrado, compacto = false }: {
  tipoDoc: TipoDocChatter;
  doc: any;
  onRegistrado: (log: any | null) => void;
  compacto?: boolean;
}) {
  const id = doc?.id;
  const clave = claveBorrador(tipoDoc, id);
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState(TIPO_POR_DEFECTO);
  const [medio, setMedio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  // WhatsApp o el correo ya se abrieron con este mensaje: si el POST fallo, el reintento solo repite el POST.
  const [abierto, setAbierto] = useState(false);
  const guardandoRef = useRef(false);
  const textoId = useId();
  const medioId = useId();
  const mediosId = useId();
  const errorId = useId();

  // Al montar (o al cambiar de documento) se recupera el borrador.
  useEffect(() => {
    const b = leerBorrador(clave);
    setTexto(b.texto);
    setTipo(b.tipo);
    setMedio(b.medio);
    setError(null);
    setAbierto(false);
  }, [clave]);

  useEffect(() => {
    if (!guardado) return;
    const t = window.setTimeout(() => setGuardado(false), 2000);
    return () => window.clearTimeout(t);
  }, [guardado]);

  // Un tipo que el documento no admite (WhatsApp sin telefono, Correo sin correo) se trata como Nota interna.
  const tipoActivo = motivoTipoDeshabilitado(tipo, doc) ? TIPO_POR_DEFECTO : tipo;

  if (!id) return null;

  function cambiar(cambios: Partial<Borrador>) {
    if (cambios.texto !== undefined) setTexto(cambios.texto);
    if (cambios.medio !== undefined) setMedio(cambios.medio);
    if (cambios.tipo !== undefined && cambios.tipo !== tipo) {
      setTipo(cambios.tipo);
      setAbierto(false);
    }
    setError(null);
    setGuardado(false);
    escribirBorrador(clave, { texto, tipo, medio, ...cambios });
  }

  async function guardar() {
    if (guardandoRef.current) return;
    let cuerpo: ReturnType<typeof cuerpoNota>;
    try {
      cuerpo = cuerpoNota(tipoActivo, texto, medio);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    // WhatsApp / correo: se abren ANTES del await (despues el navegador bloquea la ventana). El envio lo hace el
    // usuario; aqui queda el registro.
    if (!abierto) {
      const url = tipoActivo === 'WHATSAPP'
        ? waUrl(doc?.customer_phone, cuerpo.description)
        : tipoActivo === 'CORREO'
          ? mailtoUrl(doc?.customer_email, asuntoDocumento(tipoDoc, doc?.numero), cuerpo.description)
          : null;
      if (url) {
        const ventana = window.open(url, '_blank');
        if (!ventana) {
          setError(`El navegador bloqueó la ventana de ${tipoActivo === 'WHATSAPP' ? 'WhatsApp' : 'tu correo'}: `
            + 'permite las ventanas emergentes de este sitio e intenta de nuevo. La nota no se guardó; tu texto sigue aquí.');
          return;
        }
        ventana.opener = null;
        setAbierto(true);
      }
    }
    guardandoRef.current = true;
    setGuardando(true);
    setError(null);
    try {
      const r = await apiFetch(rutaNotas(tipoDoc, id), { method: 'POST', body: JSON.stringify(cuerpo) });
      setTexto('');
      setMedio('');
      setTipo(TIPO_POR_DEFECTO);
      setAbierto(false);
      setGuardado(true);
      escribirBorrador(clave, { texto: '', tipo: TIPO_POR_DEFECTO, medio: '' });
      onRegistrado(r?.data ?? null);
    } catch (err) {
      console.error(err);
      setError(mensajeNoGuardado(err));
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  }

  const info = TIPOS_CHATTER[tipoActivo];
  const largo = largoTexto(texto);
  const llamar = tipoActivo === 'LLAMADA' ? telUrl(doc?.customer_phone) : null;
  const ayudaApp = tipoActivo === 'WHATSAPP'
    ? 'Se abre WhatsApp con este mensaje para que lo envíes tú; aquí queda el registro.'
    : tipoActivo === 'CORREO'
      ? 'Se abre tu correo con este mensaje para que lo envíes tú; aquí queda el registro.'
      : null;

  return (
    <div className={compacto ? 'space-y-2' : 'space-y-3'}>
      <div>
        <p className={`${compacto ? 'text-xs' : 'text-sm'} font-black text-slate-800`}>Notas internas y seguimiento</p>
        <p className="text-xs text-slate-500">Solo las ve tu equipo: el cliente no recibe lo que guardes aquí.</p>
      </div>

      <div role="group" aria-label="Tipo de nota" className="flex flex-wrap gap-1.5">
        {TIPOS.map((t) => {
          const IconoTipo = ICONOS[t];
          const motivo = motivoTipoDeshabilitado(t, doc);
          const activo = t === tipoActivo;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={activo}
              aria-disabled={!!motivo || guardando}
              title={motivo ?? TIPOS_CHATTER[t].titulo}
              onClick={() => { if (!motivo && !guardando) cambiar({ tipo: t }); }}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors ${
                activo ? COLORES[t].activo : COLORES[t].chip} ${motivo ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-sm'}`}
            >
              <IconoTipo size={12} />
              {TIPOS_CHATTER[t].chip}
            </button>
          );
        })}
      </div>

      {tipoActivo === 'EXTERNA' && (
        <div>
          <label htmlFor={medioId} className="text-xs font-bold text-slate-600">Medio (opcional)</label>
          <input
            id={medioId}
            list={mediosId}
            value={medio}
            maxLength={MAX_MEDIO_CHATTER}
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

      <div>
        <textarea
          id={textoId}
          value={texto}
          rows={compacto ? 2 : 3}
          maxLength={MAX_TEXTO_CHATTER}
          placeholder={info.placeholder}
          aria-label={info.titulo}
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
          <p className={`text-right text-xs ${largo > MAX_TEXTO_CHATTER ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
            {largo}/{MAX_TEXTO_CHATTER}
          </p>
        )}
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {guardado && (
          <span role="status" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
            <Check size={12} /> Guardado
          </span>
        )}
        {!compacto && <span className="text-[11px] text-slate-400">Ctrl + Enter para guardar</span>}
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
        <p className="text-sm text-slate-400 italic text-center py-8">Todavía no hay notas. Escribe la primera arriba.</p>
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
              <p className="mt-1 text-xs text-slate-400">
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
 * Contenido de la pestaña Chatter de la SC, la COT y el PVEN: la caja ARRIBA (sticky, asi la burbuja del asistente no
 * tapa el boton de guardar) y la lista debajo.
 */
export function ChatterDocumento({ tipoDoc, doc, onRegistrado }: {
  tipoDoc: TipoDocChatter;
  doc: any;
  onRegistrado: (log: any | null) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 pb-3 mb-3">
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
