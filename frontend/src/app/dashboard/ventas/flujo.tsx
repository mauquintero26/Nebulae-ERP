'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Link2, Copy, Check, ExternalLink, ArrowRight, ArrowLeft, MessageCircle } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import type { AccentColor } from '@/components/ui';
import { avisoCorreo, textosVentanaEnlace } from '@/lib/aviso-correo';
import { recuadroWhatsApp, enlaceBotonWhatsApp } from '@/lib/envio-whatsapp';
import { CLASES_TONO_AVISO, RecuadroEnvioWhatsapp, useVerificacionEntrega } from './ventana-enlace';
import { LineaSeguimientoEnlace } from './seguimiento';
import { etiquetaValorCambio } from '@/lib/etiquetas-ventas';
import { copiarTexto } from '@/lib/copiar';
import { returnToSeguro, etiquetaVolver } from '@/lib/detalle-layout';

// Piezas compartidas por las tres paginas de detalle del flujo SC -> COT -> PVEN, para
// que cada estado le diga al usuario cual es su siguiente paso en vez de dejar una
// pantalla sin acciones.

// El rol real en users.role puede ser legacy ("Admin", "Vendedor") o canonico ("ADMIN",
// "ASESOR") -- ver normalize_role en backend/app/api/dependencies.py. Comparar
// case-insensitive evita que un usuario con rol canonico (p.ej. el admin de QA) quede
// fuera de los selectores de asesor.
export function esAsesorElegible(role?: string | null): boolean {
  const r = (role || '').toLowerCase().trim();
  return r === 'admin' || r === 'vendedor' || r === 'asesor';
}

// H44+N6: quien puede crear la orden de pago (PXP) de un pedido: Administracion, Finanzas y el
// asesor, incluidos los roles legacy (replica normalize_role de dependencies.py y los roles de
// POST /ventas/pedidos/{id}/crear-pxp). Las condiciones del pedido van en pedidoAdmitePxp.
export function puedeCrearOrdenDePago(role?: string | null): boolean {
  const r = (role || '').toLowerCase().trim();
  return ['admin', 'finanzas', 'asesor', 'vendedor'].includes(r);
}

// H34 (Bloque 2, T1B): solo un administrador puede 'Eliminar permanentemente' una SC de la Papelera
// (DELETE /ventas/solicitudes/{id}/permanente exige ROLE_ADMIN). 'Admin' legacy o 'ADMIN' canonico,
// igual que normalize_role.
export function esAdministrador(role?: string | null): boolean {
  return (role || '').toLowerCase().trim() === 'admin';
}

export type UsuarioActual = { id: number | null; email: string; name: string; role: string };

// Lo escribe AuthGuard tras validar la sesion (/auth/me).
export function getUsuarioActual(): UsuarioActual {
  if (typeof window === 'undefined') return { id: null, email: '', name: '', role: '' };
  const idRaw = Number(localStorage.getItem('user_id'));
  return {
    id: Number.isFinite(idRaw) && idRaw > 0 ? idRaw : null,
    email: localStorage.getItem('user_email') || '',
    name: localStorage.getItem('user_name') || '',
    role: localStorage.getItem('user_role') || '',
  };
}

// "Volver al origen": solo se confia en return_to si es una ruta interna del dashboard
// que no cambia de origen al resolverla. Un simple startsWith('/') no basta -- el
// parser de URL trata "\" como "/" y recorta tab/CR/LF, asi que "/\evil.com" escapa
// del origen aunque empiece con un solo "/". La regla vive en lib/detalle-layout.js
// (T6B, con sus pruebas node); aqui se reexporta con el mismo nombre de siempre.
export { returnToSeguro };

// H37 (Bloque 2, T6B): el UNICO boton de volver de los detalles (SC, COT, PVEN), con su destino
// escrito ('Volver a la solicitud', 'Volver a pedidos'...). `href` sale de destinoVolver(return_to,
// lista del documento); por si acaso se vuelve a sanear aqui (si no pasa, va al Hub de Ventas).
export function BotonVolver({ href }: { href: string }) {
  const destino = returnToSeguro(href) || '/dashboard/ventas';
  const etiqueta = etiquetaVolver(destino);
  return (
    <Link
      href={destino}
      title={etiqueta}
      aria-label={etiqueta}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors whitespace-nowrap"
    >
      <ArrowLeft size={16} className="shrink-0" />
      <span>{etiqueta}</span>
    </Link>
  );
}

type Tone = 'amber' | 'indigo' | 'blue' | 'emerald' | 'slate' | 'rose';

const TONE_CLASSES: Record<Tone, { box: string; title: string; text: string }> = {
  amber:   { box: 'bg-amber-50 border-amber-200',     title: 'text-amber-800',   text: 'text-amber-700' },
  indigo:  { box: 'bg-indigo-50 border-indigo-200',   title: 'text-indigo-800',  text: 'text-indigo-700' },
  blue:    { box: 'bg-blue-50 border-blue-200',       title: 'text-blue-800',    text: 'text-blue-700' },
  emerald: { box: 'bg-emerald-50 border-emerald-200', title: 'text-emerald-800', text: 'text-emerald-700' },
  slate:   { box: 'bg-slate-50 border-slate-200',     title: 'text-slate-700',   text: 'text-slate-500' },
  rose:    { box: 'bg-rose-50 border-rose-200',       title: 'text-rose-800',    text: 'text-rose-700' },
};

export function NextStepCard({ tone, title, children, actions }: {
  tone: Tone;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${t.box}`}>
      <div>
        <p className={`text-[10px] font-black uppercase tracking-wider opacity-70 ${t.title}`}>Siguiente paso</p>
        <p className={`text-sm font-black ${t.title}`}>{title}</p>
        {children && <p className={`text-xs mt-1 leading-relaxed ${t.text}`}>{children}</p>}
      </div>
      {actions && <div className="space-y-2 [&>button]:w-full">{actions}</div>}
    </div>
  );
}

// El token crudo solo existe en la respuesta del envio (en la base se guarda su hash),
// asi que este es el unico momento en que el asesor puede ver/copiar el enlace. Sin esto,
// con el canal "Email"/"Otro" -- o sin SMTP configurado -- el enlace no llegaba a ningun
// lado y el cliente nunca podia confirmar.
// H27+H39: `correo` es el resultado del correo de respaldo que devuelve el envio y `canal` el
// canal elegido; el recuadro dice en verde si el correo salio o en ambar por que no y que hacer.
// B13: `whatsappUrl` es el wa.me que se intento abrir al enviar; con canal WhatsApp el modal ofrece
// "Abrir WhatsApp" por si el navegador bloqueo esa ventana.
// B3 T16 (C28: un solo dueño; recuadros en este orden: WhatsApp, correo, vencimiento, recordatorio). Props opcionales:
// - envioWhatsapp (RP23): el `whatsapp` de la respuesta del envío (el resultado del automático, U16-envio). No es la
//   envioWhatsApp {automatico, listo} del ChannelModal. Con él, el recuadro verde/azul/ámbar y la verificación de entrega
//   a los 6 s con «Volver a revisar» (U16-entrega); el botón manual sigue siendo UNO solo (enlaceBotonWhatsApp).
// - telefono: el del cliente (telefono_whatsapp, el e164 de T8) para armar ese botón con el texto del servidor.
// - vence: el último día en que sirve el enlace ('AAAA-MM-DD' de la respuesta del envío, C14); sin él (SC), 2 días.
// - tipo: 'consulta' para el pedido (U23): otro título y texto, sin la nota de «Solo el cliente…».
// - seguimiento: el recordatorio programado (`seguimiento` de la respuesta, U16-seguimiento).
export function EnlaceConfirmacionModal({ documento, link, color = 'indigo', correo, canal, whatsappUrl, envioWhatsapp,
  telefono, vence, tipo = 'confirmacion', seguimiento, onClose }: {
  documento: string;
  link: string;
  color?: AccentColor;
  correo?: { enviado: boolean; destino?: string | null; motivo?: string | null; mensaje?: string } | null;
  canal?: string | null;
  whatsappUrl?: string | null;
  envioWhatsapp?: unknown;
  telefono?: string | null;
  vence?: string | null;
  tipo?: 'confirmacion' | 'consulta';
  seguimiento?: unknown;
  onClose: () => void;
}) {
  // H30: 'manual' = ni el portapapeles ni la copia de la seleccion funcionaron (p. ej. HTTP con IP, sin
  // navigator.clipboard): el enlace queda seleccionado y sale el aviso ambar. Nunca falla en silencio.
  const [estadoCopia, setEstadoCopia] = useState<'idle' | 'copiado' | 'manual'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  // Un solo temporizador de 'Copiado': se reprograma en cada copia y se cancela al cerrar el modal.
  const temporizadorCopia = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entrega = useVerificacionEntrega(envioWhatsapp);
  const recuadroWa = recuadroWhatsApp(envioWhatsapp, canal, entrega.verificacion);
  const whatsappSalio = recuadroWa?.salio === true;
  const aviso = avisoCorreo(correo, canal, whatsappSalio);
  const abrirWhatsApp = enlaceBotonWhatsApp({ canal, envio: envioWhatsapp, botonManual: recuadroWa?.botonManual === true,
    telefono, whatsappUrl });
  const textos = textosVentanaEnlace({ tipo, documento, vence, whatsappEnviado: whatsappSalio });

  useEffect(() => () => {
    if (temporizadorCopia.current) clearTimeout(temporizadorCopia.current);
  }, []);

  function seleccionarEnlace(): HTMLInputElement | null {
    const el = inputRef.current;
    if (!el) return null;
    el.focus();
    el.select();
    el.setSelectionRange(0, el.value.length);
    return el;
  }

  async function copiar() {
    const r = await copiarTexto(link, {
      portapapeles: typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
      copiarSeleccion: () => !!seleccionarEnlace() && document.execCommand('copy'),
    });
    if (temporizadorCopia.current) clearTimeout(temporizadorCopia.current);
    temporizadorCopia.current = null;
    if (r === 'copiado') {
      setEstadoCopia('copiado');
      temporizadorCopia.current = setTimeout(() => setEstadoCopia((e) => (e === 'copiado' ? 'idle' : e)), 2000);
    } else {
      setEstadoCopia('manual');
      seleccionarEnlace();
    }
  }

  return (
    <Modal
      title={textos.titulo}
      subtitle={textos.subtitulo}
      icon={Link2}
      color={color}
      maxWidth="lg"
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      {recuadroWa && <RecuadroEnvioWhatsapp recuadro={recuadroWa} entrega={entrega} />}
      {aviso && (
        <div className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${CLASES_TONO_AVISO[aviso.tono]}`}>
          {aviso.texto}
        </div>
      )}
      <p className="text-sm text-slate-600">
        {textos.intro} {textos.vigencia}
      </p>
      <LineaSeguimientoEnlace seguimiento={seguimiento} />
      <input
        ref={inputRef}
        readOnly
        value={link}
        onFocus={e => e.currentTarget.select()}
        className={`w-full border bg-slate-50 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-700 outline-none ${estadoCopia === 'manual'
          ? 'border-amber-400 ring-2 ring-amber-200'
          : 'border-slate-200'}`}
      />
      {estadoCopia === 'manual' && (
        <p role="status" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          No se pudo copiar automáticamente. El enlace quedó seleccionado: cópialo con Ctrl+C (en el celular, mantén presionado y elige Copiar) y pégalo en el mensaje al cliente.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button color={color} icon={estadoCopia === 'copiado' ? Check : Copy} onClick={copiar}>
          {estadoCopia === 'copiado' ? 'Copiado' : 'Copiar enlace'}
        </Button>
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl font-bold flex items-center justify-center gap-2 px-5 py-2.5 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white"
        >
          <ExternalLink size={14} /> Abrir como cliente
        </a>
        {abrirWhatsApp && (
          <a
            href={abrirWhatsApp}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl font-bold flex items-center justify-center gap-2 px-5 py-2.5 text-sm border border-green-200 text-green-700 hover:bg-green-50 bg-white"
          >
            <MessageCircle size={14} /> Abrir WhatsApp con el mensaje
          </a>
        )}
      </div>
      {textos.nota && (
        <p className="text-[11px] text-slate-400">{textos.nota}</p>
      )}
    </Modal>
  );
}

// T11 (V3): la cabecera (titulo + fecha) de una tarjeta de las lineas de tiempo de Actividad de la SC, la COT y el PVEN:
// la misma en las tres. Revision final (F12): SIEMPRE apilada, en los dos anchos. Con la fecha al lado (justify-between y
// basis-28), a 1440 px el titulo quedaba en una columna angosta de 6 a 8 lineas. Ahora el titulo usa todo el ancho
// (break-words parte una palabra larga) y la fecha va debajo, en su propia linea, chica, gris y sin partirse.
export function CabeceraActividad({ titulo, fecha, className = 'mb-1.5' }: {
  titulo: React.ReactNode;
  fecha: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="min-w-0 break-words font-bold text-slate-800 text-sm">{titulo}</span>
      <span className="whitespace-nowrap text-[10px] font-bold text-slate-400">{fecha}</span>
    </div>
  );
}

type CambioActividad = { campo?: string; etiqueta: string; antes?: string | null; despues?: string | null };

// Detalle de lo que cambio en una edicion o re-cotizacion. El backend lo guarda en
// extra_data.cambios (ver backend/app/core/cambios_documento.py) y lo muestran las lineas
// de tiempo de Actividad de SC, COT, PVEN y el panel del Hub.
export function CambiosDeActividad({ extra }: { extra?: any }) {
  const cambios: CambioActividad[] = Array.isArray(extra?.cambios) ? extra.cambios : [];
  if (cambios.length === 0) return null;
  return (
    <ul className="mb-2 space-y-1">
      {cambios.map((c, i) => {
        // Un campo suelto (Notas, Total...) siempre muestra antes y despues, con "—" si estaba
        // vacio. Las lineas de producto (agregado, eliminado, cantidad...) solo lo que traen.
        const esCampo = !!c.campo && !['productos', 'productos_sku', 'mas'].includes(c.campo);
        // El tipo de solicitud y la modalidad de pago se guardan sin tilde: aqui se muestran con tilde (H7+H41).
        const antes = etiquetaValorCambio(c.campo, c.antes) ?? (esCampo ? '—' : null);
        const despues = etiquetaValorCambio(c.campo, c.despues) ?? (esCampo ? '—' : null);
        return (
          <li key={i} className="text-xs text-slate-600 flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-bold text-slate-700">{c.etiqueta}{antes || despues ? ':' : ''}</span>
            {antes && <span className="text-slate-400 line-through">{antes}</span>}
            {antes && despues && <ArrowRight size={10} className="text-slate-300 self-center" />}
            {despues && <span className="font-semibold text-slate-800">{despues}</span>}
          </li>
        );
      })}
    </ul>
  );
}
