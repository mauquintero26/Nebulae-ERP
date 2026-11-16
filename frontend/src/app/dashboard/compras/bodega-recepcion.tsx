'use client';

// B4 T24 f3 r1 (C1, la raíz): la bodega receptora al CREAR una recepción («Recepcionar PEC» en Compras › Recepciones y «Hacer recepción»
// en el panel de un PEC; los dos son de ADMIN y COMPRAS). El servidor ya acepta body.warehouse_id (crear_recepcion_desde_pec: wid =
// body.warehouse_id or p.warehouse_id); sin ella la recepción nacía sin bodega y BODEGA no podía confirmarla. El select es opcional y,
// sin tocarlo, va la única bodega si hay una sola (bodegaRecepcion, lib/estados-compras.js).
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { normalizarRespuesta } from '@/lib/tabla';
import { ofreceReintentar, textoDeError } from '@/lib/avisos';
import { bodegaRecepcion } from '@/lib/estados-compras';
import { FOCOS } from '@/lib/design-system';
import type { AcentoFoco } from '@/lib/design-system';

type Bodega = { id: number; name?: string | null };
type CargaBodegas = { vuelta: number; filas: Bodega[] | null; error: unknown };

/** GET /inventory/warehouses mientras `activo` (la ventana abierta), con su vuelta para «Reintentar» y sin pisar las filas con un error. */
export function useBodegasRecepcion(activo: boolean) {
  const [vuelta, setVuelta] = useState(0);
  const [carga, setCarga] = useState<CargaBodegas>({ vuelta: -1, filas: null, error: null });
  useEffect(() => {
    if (!activo) return undefined;
    const control = new AbortController();
    apiFetch('/inventory/warehouses', { signal: control.signal })
      .then((r: unknown) => setCarga({ vuelta, filas: normalizarRespuesta(r).filas as Bodega[], error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setCarga((c) => ({ vuelta, filas: c.filas, error: err })); });
    return () => control.abort();
  }, [activo, vuelta]);
  return { filas: carga.filas, error: carga.error, cargando: carga.vuelta !== vuelta, recargar: () => setVuelta((n) => n + 1) };
}

/**
 * El select «Bodega receptora». `elegida` es lo que el usuario eligió (null: no lo tocó; entonces se ve la que va: bodegaRecepcion).
 * Mientras carga, deshabilitado; si falla, el detalle del servidor y «Reintentar» (un 403 no lo ofrece), sin impedir crear la recepción.
 */
export function SelectorBodegaRecepcion({ id, bodegas, elegida, onElegir, deshabilitado = false, acento = 'teal' }: {
  id: string; bodegas: ReturnType<typeof useBodegasRecepcion>; elegida: string | null; onElegir: (valor: string) => void;
  deshabilitado?: boolean; acento?: AcentoFoco;
}) {
  const valor = bodegaRecepcion(elegida, bodegas.filas);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label htmlFor={id} className="font-bold text-slate-600">Bodega receptora</label>
      <select id={id} value={valor} onChange={(e) => onElegir(e.target.value)} disabled={deshabilitado || (bodegas.cargando && !bodegas.filas)}
        className={`min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60 ${FOCOS[acento]}`}>
        <option value="">{bodegas.cargando && !bodegas.filas ? 'Cargando bodegas…' : 'Sin elegir (la del pedido, si tiene)'}</option>
        {(bodegas.filas ?? []).map((b) => <option key={b.id} value={String(b.id)}>{b.name || `Bodega ${b.id}`}</option>)}
      </select>
      {bodegas.error != null && (
        <span role="alert" className="inline-flex items-center gap-1.5 font-semibold text-rose-700">
          {textoDeError(bodegas.error, 'No se pudieron cargar las bodegas')}
          {ofreceReintentar(bodegas.error) && (
            <button type="button" onClick={bodegas.recargar} className={`rounded font-bold underline ${FOCOS[acento]}`}>Reintentar</button>
          )}
        </span>
      )}
    </div>
  );
}
