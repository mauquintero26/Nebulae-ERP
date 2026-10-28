'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { cadenaVentas } from '@/lib/flujo-ventas';
import { infoEstadoSolicitud } from '@/lib/estados-solicitud';
import { infoEstadoCotizacion } from '@/lib/estados-cotizacion';
import { infoEstadoPedido } from '@/lib/estados-pedido';
import { PasosFlujo } from './PasosFlujo';
import type { DocumentoCadena, TipoCadena } from './tipos';

/**
 * FLUJO-documentos punto 2 (Bloque 4, T5A; RP4 y RP74): la barra Solicitud → Cotización → Pedido de venta (→ Compra) de
 * cada documento y del panel rápido del Hub. Solo pinta: las cajas, sus estados, 'Estás aquí' y los enlaces (con
 * ?return_to= de la pantalla actual, para que 'Volver' regrese aquí) salen de cadenaVentas (lib/flujo-ventas.js).
 *  - tipo 'SC', 'COT' o 'PVEN'; 'VEN' es lo mismo que 'PVEN' (RP74: el panel rápido del Hub pasa filas con tipo 'VEN').
 *  - Las etiquetas de estado son las únicas de cada documento (RP4): infoEstadoSolicitud, infoEstadoCotizacion
 *    (lib/estados-cotizacion.js, {label, clases}; no el ESTADOS hex de cotizacion-client.tsx) e infoEstadoPedido.
 *  - rutaActual = usePathname().
 *  - compacta (el panel rápido): círculos de 22 px y solo el número de cada documento (sin su estado en palabras).
 * Sin documento no pinta nada.
 */

export type PropsCadenaDocumentos = {
  doc: DocumentoCadena | null | undefined;
  tipo: TipoCadena;
  compacta?: boolean;
};

/** RP4: las tablas únicas de etiquetas (las mismas que cadenaVentas usa por defecto, pasadas a la vista). */
const ETIQUETAS = { sc: infoEstadoSolicitud, cot: infoEstadoCotizacion, pven: infoEstadoPedido };

/** compacta: ninguna etiqueta de estado (cadenaVentas deja solo el número del documento). */
const SIN_ESTADO = () => '';
const SOLO_NUMERO = { sc: SIN_ESTADO, cot: SIN_ESTADO, pven: SIN_ESTADO };

/** La cadena de documentos de Ventas. Ver arriba. */
export function CadenaDocumentos({ doc, tipo, compacta = false }: PropsCadenaDocumentos) {
  const rutaActual = usePathname();
  const pasos = useMemo(
    () => cadenaVentas(doc, tipo, { etiquetas: compacta ? SOLO_NUMERO : ETIQUETAS, rutaActual: rutaActual || null }),
    [doc, tipo, compacta, rutaActual],
  );
  if (!pasos.length) return null;
  return <PasosFlujo variante="barra" pasos={pasos} etiqueta="Flujo de este documento" compacto={compacta} />;
}
