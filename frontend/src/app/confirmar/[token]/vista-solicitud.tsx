'use client';

import type { ReactNode } from 'react';
import { ContactoEmpresa, DocumentoComercial } from '@/components/documento';
import {
  metaDeLaVista, selloDeLaVista, textoAntesDeConfirmar, type VistaPublica,
} from '@/lib/confirmacion-publica';
import { coloresBotonPrincipal, formatoCantidad, totalUnidades } from '@/lib/documento-comercial';

/** Las props de VistaSolicitud y VistaCotizacion (las dos vistas del documento en /confirmar/{token}). */
export type PropsVista = {
  /** La vista de vistaDeRespuesta con un documento completo (vistaConDocumento). */
  vista: VistaPublica;
  /** La URL del API (API_URL de lib/api.ts), para el logo. */
  apiUrl: string;
  /** La hoja ya confirmada, sin botones ni «¿Qué pasa si confirmo?» (AvisoEnlace en 'confirmada'). */
  soloLectura?: boolean;
  /** El aviso encima de la hoja (el de AvisoEnlace, con el h1 de la página: la hoja pasa a h2). */
  aviso?: ReactNode;
  onConfirmar?: () => void;
  confirmando?: boolean;
  onPedirCambios?: () => void;
  /** El error de la última acción (sin red o del servidor), junto a los botones (respuestaDeAccion). */
  errorAccion?: string | null;
  /** El panel «Pedir cambios» abierto: reemplaza a los botones, en su lugar debajo de la hoja. */
  panel?: ReactNode;
};

/** «¿Qué pasa si confirmo?» (textoAntesDeConfirmar), dentro de la hoja y sin imprimir. */
export function QuePasaSiConfirmo({ texto }: { texto: string }) {
  if (!texto) return null;
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 print:hidden">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">¿Qué pasa si confirmo?</h2>
      <p className="mt-1 text-sm text-gray-800">{texto}</p>
    </section>
  );
}

/**
 * Los botones de la página (fijos abajo en el celular, ocultos al imprimir: los pone DocumentoComercial): el principal
 * con los colores de la marca y al menos 44 px de alto, 'Pedir cambios' con borde y la ayuda debajo. El error de la
 * última acción va encima, sin perder la hoja.
 */
export function AccionesConfirmar({ etiqueta, colores, onConfirmar, confirmando, onPedirCambios, error }: {
  etiqueta: string;
  colores: { fondo: string; texto: string };
  onConfirmar?: () => void;
  confirmando: boolean;
  onPedirCambios?: () => void;
  error?: string | null;
}) {
  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}
      <div className="flex gap-2 @min-[40rem]:justify-end">
        <button
          type="button"
          onClick={onConfirmar}
          disabled={confirmando}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg px-5 py-2 text-sm font-bold disabled:cursor-wait disabled:opacity-60 @min-[40rem]:flex-none"
          style={{ background: colores.fondo, color: colores.texto }}
        >
          {confirmando ? 'Confirmando…' : etiqueta}
        </button>
        <button
          type="button"
          onClick={onPedirCambios}
          disabled={confirmando}
          className="min-h-[44px] shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          Pedir cambios
        </button>
      </div>
      <p className="text-xs text-gray-600 @min-[40rem]:text-right">
        ¿Algo no está bien? Toca Pedir cambios y cuéntanos qué cambiar.
      </p>
    </div>
  );
}

/**
 * La solicitud que ve el cliente (B3 T15: U17+H28 punto 10, C3): DocumentoComercial en la variante 'degradado' (la
 * franja morado -> rojo de la referencia) sin precios. Aquí solo se arman:
 * - el encabezado: 'Esperando tu confirmación' y 'Puedes confirmar hasta …' (metaDeLaVista), y el sello 'Confirmada';
 * - bajo la tabla: la pastilla 'Total de unidades: N' con el mismo degradado y 'Los precios llegan en la cotización.';
 * - «¿Qué pasa si confirmo?» y el contacto (ContactoEmpresa), dentro de la hoja y sin imprimir;
 * - los botones 'Confirmar solicitud' y 'Pedir cambios' (o el panel de cambios, que los reemplaza).
 * En soloLectura (ya confirmada) la hoja queda sin botones, bajo el aviso.
 */
export function VistaSolicitud({
  vista, apiUrl, soloLectura = false, aviso, onConfirmar, confirmando = false, onPedirCambios, errorAccion, panel,
}: PropsVista) {
  const doc = vista.documento;
  const unidades = totalUnidades(doc);
  const colores = coloresBotonPrincipal(vista.empresa, 'degradado');
  const extra = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {unidades !== null && (
          <span
            className="inline-flex items-center rounded-full px-4 py-1.5 text-sm font-bold tabular-nums"
            style={{ background: colores.fondo, color: colores.texto }}
          >
            Total de unidades: {formatoCantidad(unidades)}
          </span>
        )}
        <span className="text-sm text-gray-600">Los precios llegan en la cotización.</span>
      </div>
      {!soloLectura && (
        <>
          <QuePasaSiConfirmo texto={textoAntesDeConfirmar(doc)} />
          <div className="print:hidden">
            <ContactoEmpresa empresa={vista.empresa} asesor={doc?.atendido_por} numero={doc?.numero} tipo="SC" />
          </div>
        </>
      )}
    </div>
  );
  const acciones = soloLectura || panel ? undefined : (
    <AccionesConfirmar
      etiqueta="Confirmar solicitud"
      colores={colores}
      onConfirmar={onConfirmar}
      confirmando={confirmando}
      onPedirCambios={onPedirCambios}
      error={errorAccion}
    />
  );
  return (
    <>
      <DocumentoComercial
        documento={doc}
        marca={vista.empresa}
        apiUrl={apiUrl}
        variante="degradado"
        sello={selloDeLaVista(vista)}
        aviso={aviso}
        metaDerecha={metaDeLaVista(vista)}
        extraTotales={extra}
        acciones={acciones}
        nivelTitulo={aviso ? 2 : 1}
      />
      {!soloLectura && panel}
    </>
  );
}
