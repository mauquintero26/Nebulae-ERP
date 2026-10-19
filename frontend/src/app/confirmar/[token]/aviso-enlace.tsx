'use client';

import {
  AlertTriangle, Ban, CalendarX, CheckCircle2, Clock, FileText, Link2Off, MessageSquare, RefreshCw, WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { ContactoEmpresa, EncabezadoMarca } from '@/components/documento';
import {
  lineaConfirmacion, parrafoDelAviso, queSigue, vistaConDocumento, type VistaPublica,
} from '@/lib/confirmacion-publica';
import { TIPOS_DOCUMENTO } from '@/lib/documento-comercial';
import { VistaCotizacion } from './vista-cotizacion';
import { VistaSolicitud } from './vista-solicitud';

// Los íconos de TEXTOS_ENLACE (lib/confirmacion-publica.js) por su nombre de lucide.
const ICONOS: Record<string, LucideIcon> = {
  AlertTriangle, Ban, CalendarX, CheckCircle2, Clock, FileText, Link2Off, MessageSquare, RefreshCw, WifiOff,
};
// El color del ícono por tono (los mismos del sello de DocumentoComercial).
const COLOR_TONO: Record<string, string> = { ok: '#15803D', info: '#1D4ED8', alerta: '#B45309', gris: '#4B5563' };

/** Mientras carga la página del cliente (todavía no se sabe la marca: sin colores de nadie). */
export function CargandoDocumento() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-gray-500" role="status">
      <RefreshCw className="animate-spin" size={32} aria-hidden="true" />
      <p className="text-sm">Cargando tu documento…</p>
    </div>
  );
}

/**
 * Lo que dice el aviso (encabezado + párrafo, nota del controlador después de T12): el ícono y el h1 de la página, el
 * párrafo (parrafoDelAviso), la fecha de la confirmación (lineaConfirmacion, RP26), el comentario del cliente citado
 * (como texto), «¿Qué sigue?» (queSigue, con los datos para pagar de la COT), 'Reintentar' y el contacto.
 */
function ContenidoAviso({ vista, onReintentar }: { vista: VistaPublica; onReintentar?: () => void }) {
  const Icono = ICONOS[vista.icono] ?? AlertTriangle;
  const parrafo = parrafoDelAviso(vista);
  const linea = lineaConfirmacion(vista);
  const { pasos, instrucciones } = queSigue(vista);
  const doc = vista.documento;
  const tipo = vista.tipo ?? undefined;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Icono size={28} className="mt-0.5 shrink-0" style={{ color: COLOR_TONO[vista.tono] ?? COLOR_TONO.gris }} aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <h1 className="break-words text-xl font-bold text-gray-900">{vista.titulo}</h1>
          {parrafo && <p className="break-words text-sm text-gray-700">{parrafo}</p>}
          {linea && <p className="text-sm text-gray-700">{linea}</p>}
        </div>
      </div>

      {vista.comentario && (
        <figure className="space-y-1">
          <figcaption className="text-xs font-semibold text-gray-500">Tu mensaje</figcaption>
          <blockquote className="whitespace-pre-line break-words rounded-lg border-l-4 border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-800">
            «{vista.comentario}»
          </blockquote>
        </figure>
      )}

      {pasos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-gray-900">¿Qué sigue?</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-800">
            {pasos.map((paso, i) => <li key={i}>{paso}</li>)}
          </ol>
          {instrucciones && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-gray-600">Datos para pagar</p>
              <p className="whitespace-pre-line break-words text-sm text-gray-800">{instrucciones}</p>
            </div>
          )}
        </section>
      )}

      {vista.reintentar && onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Reintentar
        </button>
      )}

      <ContactoEmpresa empresa={vista.empresa} asesor={doc?.atendido_por} numero={doc?.numero} tipo={tipo} />
    </div>
  );
}

/**
 * Todo lo que no es la hoja por confirmar (B3 T15: U17+H28 punto 11, H28-cambios, U22+H38; C10, C26): el estado del
 * enlace en palabras, siempre con la marca de la empresa (viene en la respuesta) y su contacto.
 * - 'confirmada' con el documento (la SC durante 30 días, o el 200 de confirmar): el aviso verde con '¡Gracias! Tu
 *   confirmación fue registrada.' o 'Esta solicitud ya fue confirmada', la fecha y «¿Qué sigue?», y debajo la hoja en
 *   solo lectura con el sello 'Confirmada' (VistaSolicitud o VistaCotizacion).
 * - Los demás (la COT confirmada con solo su número, vencido, reemplazado, cambios enviados, actualizada, no
 *   disponible, inválido, sin conexión, error, y el enlace del pedido que no sirve): una tarjeta con el encabezado de la
 *   empresa (EncabezadoMarca; sin documento, solo el logo y el nombre), el mensaje y el contacto. Sin conexión o con
 *   un error, 'Reintentar'.
 * La usa también /pedido/{token} (U23: la pantalla genérica de enlace no válido).
 */
export function AvisoEnlace({ vista, apiUrl, onReintentar }: {
  vista: VistaPublica;
  /** La URL del API (API_URL de lib/api.ts), para el logo. */
  apiUrl: string;
  /** Vuelve a cargar la página (sin conexión o un error). */
  onReintentar?: () => void;
}) {
  if (vista.estado_enlace === 'confirmada' && vistaConDocumento(vista) && (vista.tipo === 'SC' || vista.tipo === 'COT')) {
    const aviso = (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
        <ContenidoAviso vista={vista} />
      </div>
    );
    return vista.tipo === 'SC'
      ? <VistaSolicitud vista={vista} apiUrl={apiUrl} soloLectura aviso={aviso} />
      : <VistaCotizacion vista={vista} apiUrl={apiUrl} soloLectura aviso={aviso} />;
  }
  const tipo = vista.tipo;
  const numero = typeof vista.documento?.numero === 'string' ? vista.documento.numero : undefined;
  return (
    <div className="mx-auto w-full max-w-xl space-y-5 rounded-2xl bg-white p-5 text-gray-900 shadow-lg sm:p-8">
      <EncabezadoMarca marca={vista.empresa} apiUrl={apiUrl} titulo={tipo ? TIPOS_DOCUMENTO[tipo].titulo : undefined} numero={numero} />
      <ContenidoAviso vista={vista} onReintentar={onReintentar} />
    </div>
  );
}
