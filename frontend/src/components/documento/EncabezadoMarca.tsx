import type { CSSProperties } from 'react';
import { colorSobreBlanco, colorTextoSobre } from '@/lib/documento-comercial';
import { inicialesMarca, normalizarMarca, urlLogo } from '@/lib/marca-empresa';

/**
 * El logo (o un monograma con las iniciales) y el nombre de la empresa (Bloque 3, T12: PLANTILLA, MARCA, C3).
 * - Sin marca configurada no muestra nada: nunca un nombre fijo ni un dato de ejemplo.
 * - sobre='franja': va sobre la franja degradada de la solicitud; el texto hereda el color que la franja calculó
 *   (colorTextoSobre) y el monograma es translúcido.
 * - El logo es un <img> simple (no next/image) que no manda Referer: la URL de la página lleva el token.
 */
export function LogoMarca({ marca, apiUrl, sobre = 'hoja' }: {
  marca: unknown;
  apiUrl: string;
  sobre?: 'hoja' | 'franja';
}) {
  const m = normalizarMarca(marca);
  const logo = urlLogo(m, apiUrl);
  const nombre = m.nombre_comercial;
  if (!logo && !nombre) return null;
  const monograma: CSSProperties = sobre === 'franja'
    ? { backgroundColor: 'rgba(255, 255, 255, 0.2)' }
    : { backgroundColor: m.colores.principal, color: colorTextoSobre(m.colores.principal) };
  return (
    <div className="flex min-w-0 items-center gap-3">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={nombre ? `Logo de ${nombre}` : 'Logo de la empresa'}
          referrerPolicy="no-referrer"
          className="h-12 w-auto max-w-[160px] shrink-0 object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold"
          style={monograma}
        >
          {inicialesMarca(nombre)}
        </span>
      )}
      {nombre && <span className="min-w-0 break-words text-lg font-bold leading-tight">{nombre}</span>}
    </div>
  );
}

/**
 * El encabezado de las páginas del cliente que no muestran el documento (enlace vencido, reemplazado, no disponible,
 * ya confirmado sin resumen…): la marca a la izquierda y, a la derecha, el tipo de documento en el color de acento
 * (si se lee sobre blanco) y su número. Sin marca configurada queda solo el tipo y el número.
 */
export function EncabezadoMarca({ marca, apiUrl, titulo, numero }: {
  marca: unknown;
  apiUrl: string;
  titulo?: string;
  numero?: string;
}) {
  const m = normalizarMarca(marca);
  const acento = colorSobreBlanco(m.colores.acento);
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4 text-gray-900">
      <LogoMarca marca={m} apiUrl={apiUrl} />
      {(titulo || numero) && (
        <div className="ml-auto text-right">
          {titulo && (
            <p className="text-sm font-bold uppercase tracking-wide" style={{ color: acento }}>
              {titulo}
            </p>
          )}
          {numero && <p className="break-words text-sm text-gray-600">N.º {numero}</p>}
        </div>
      )}
    </header>
  );
}
