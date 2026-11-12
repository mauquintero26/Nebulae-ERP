'use client';

// B4 T24 f3 r1 (F81): el error de un catálogo de la barra (las bodegas, las categorías) que falla cuando YA había filas (un «Actualizar»
// que falla): SelectorCatalogo solo lo dice sin filas, así que el error quedaba escondido detrás del select con lo viejo. Esta línea va
// junto al select (role=alert) con el detalle del servidor y «Reintentar», que da señal mientras pide («Reintentando…», aria-disabled:
// conserva el foco). Un 403 no ofrece «Reintentar» (ofreceReintentar, FINAL-C5). Sin error, o sin filas (eso lo dice SelectorCatalogo),
// nada.
import { ofreceReintentar, textoDeError } from '@/lib/avisos';
import { FOCOS } from '@/lib/design-system';
import type { AcentoFoco } from '@/lib/design-system';
import type { Catalogo } from './piezas-inventario';

export function AvisoCatalogoViejo({ catalogo, fallo, onReintentar, acento = 'indigo' }: {
  catalogo: Catalogo; fallo: string; onReintentar: () => void; acento?: AcentoFoco;
}) {
  if (catalogo.error == null || !catalogo.filas) return null;
  return (
    <span role="alert" className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800">
      {textoDeError(catalogo.error, fallo)}.
      {ofreceReintentar(catalogo.error) && (
        <button type="button" onClick={catalogo.cargando ? undefined : onReintentar} aria-disabled={catalogo.cargando || undefined}
          className={`rounded font-bold underline aria-disabled:cursor-wait ${FOCOS[acento]}`}>
          {catalogo.cargando ? 'Reintentando…' : 'Reintentar'}
        </button>
      )}
    </span>
  );
}
