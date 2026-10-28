'use client';

import { useId } from 'react';
import Link from 'next/link';
import {
  ArrowLeftRight, Circle, ClipboardList, FileText, Package, PackageCheck, PackageMinus, PackagePlus, Receipt, ShoppingBag,
  ShoppingCart, SlidersHorizontal, Undo2, Users, Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  MAX_MOVIMIENTOS, bloqueSinDatos, enlaceDocumento, iconoMovimiento, montoMovimiento,
} from '@/lib/analisis';
import type { FilaMovimiento, MovimientosAnalisis } from '@/lib/analisis';
import { fechaHoraLarga, hace } from '@/lib/fechas-colombia';

/**
 * ANALISIS-base punto 2 (Bloque 4, T5B; R7, R13 y RP60): los movimientos recientes de la pestaña Análisis, sobre el
 * bloque `movimientos` del contrato. Hasta MAX_MOVIMIENTOS (8) filas, cada una con:
 *  - el ícono por tipo (iconoMovimiento: fila.tipo y, si no, fila.doc_tipo; si no, un círculo);
 *  - el título, la línea 'número · detalle' y la etiqueta del estado (recortados con su title: nunca empujan el monto);
 *  - el monto con signo y color (montoMovimiento: '+$1.500.000' en verde, '-$1.500.000' en rojo, siempre con el signo
 *    escrito, no solo el color);
 *  - la fecha relativa de hace() de lib/fechas-colombia.js (RP60: «hace un momento», «hace 2 horas», «hace 3 días»; un
 *    ISO sin zona es UTC), en un <time> con la fecha y hora exactas de Colombia en su title (fechaHoraLarga). Si hace()
 *    no la puede leer (una fecha sin hora o inválida) da '' y la fila va sin fecha: no se inventa otro formato.
 * Cada fila abre su documento: con `alAbrir`, un botón que la llama; si no, un <Link> a enlaceDocumento(doc_tipo, doc_id)
 * (sin enlace, una fila quieta). Foco visible con outline. En una tarjeta angosta (menos de 20rem, container query) el
 * monto y la fecha bajan a una línea propia debajo del título.
 * movimientos null (el módulo no los tiene): no pinta nada. Sin filas: 'Sin datos en este período'.
 * Clases de Tailwind literales, sin variantes de modo oscuro; los textos con al menos 4,5:1.
 */

export type PropsListaMovimientos = {
  movimientos: MovimientosAnalisis | null | undefined;
  /** Abre la fila (PanelAnalisis.alAbrirMovimiento). Sin él, cada fila es un <Link> a su documento. */
  alAbrir?: (fila: FilaMovimiento) => void;
  /** El ahora de la fecha relativa (por defecto, el del reloj). */
  ahora?: Date | number;
};

// Los nombres de ICONOS_MOVIMIENTO (lib/analisis.js) y su componente; test_analisis.mjs exige exactamente esos más el
// de por defecto.
const ICONOS: Record<string, LucideIcon> = {
  ArrowLeftRight, Circle, ClipboardList, FileText, Package, PackageCheck, PackageMinus, PackagePlus, Receipt, ShoppingBag,
  ShoppingCart, SlidersHorizontal, Undo2, Users, Wallet,
};

const TARJETA = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs';
const FOCO = 'outline-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
const FILA = '-mx-2 flex w-[calc(100%+1rem)] min-w-0 items-start gap-3 rounded-xl px-2 py-2 text-left';
const TONO_MONTO = { positivo: 'text-emerald-700', negativo: 'text-rose-700', neutro: 'text-slate-900' } as const;

export function ListaMovimientos({ movimientos, alAbrir, ahora }: PropsListaMovimientos) {
  const idTitulo = useId();
  if (!movimientos) return null;
  const titulo = movimientos.titulo || 'Movimientos recientes';
  const filas = bloqueSinDatos('movimientos', movimientos) ? [] : movimientos.filas.slice(0, MAX_MOVIMIENTOS);

  return (
    <section aria-labelledby={idTitulo} className={TARJETA}>
      <h3 id={idTitulo} title={titulo} className="truncate text-sm font-bold text-slate-900">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="mt-3 flex min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 px-3 text-center text-sm font-semibold text-slate-600">
          Sin datos en este período
        </p>
      ) : (
        <ul className="@container mt-2 space-y-0.5">
          {filas.map((fila, i) => {
            const Icono = ICONOS[iconoMovimiento(fila)] ?? Circle;
            const monto = montoMovimiento(fila);
            const nombre = fila.titulo || fila.numero || 'Movimiento';
            const detalle = [fila.numero, fila.detalle].filter((t) => t && t !== nombre).join(' · ');
            const relativa = hace(fila.fecha, ahora);
            const exacta = fechaHoraLarga(fila.fecha);
            const href = alAbrir ? null : enlaceDocumento(fila.doc_tipo, fila.doc_id);
            const contenido = (
              <>
                <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Icono size={16} />
                </span>
                <span className="block min-w-0 flex-1 @xs:flex @xs:items-start @xs:gap-3">
                  <span className="block min-w-0 @xs:flex-1">
                    <span title={nombre} className="block truncate text-sm font-semibold text-slate-900">{nombre}</span>
                    {detalle && <span title={detalle} className="block truncate text-xs text-slate-600">{detalle}</span>}
                    {fila.estado_etiqueta && (
                      <span title={fila.estado_etiqueta} className="mt-1 inline-block max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {fila.estado_etiqueta}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 @xs:mt-0 @xs:block @xs:shrink-0 @xs:text-right">
                    <span className={`block whitespace-nowrap text-sm font-bold tabular-nums ${TONO_MONTO[monto.tono]}`}>{monto.texto}</span>
                    {relativa && (
                      <time dateTime={fila.fecha ?? undefined} title={exacta || undefined} className="block whitespace-nowrap text-xs text-slate-600">
                        {relativa}
                      </time>
                    )}
                  </span>
                </span>
              </>
            );
            const clave = `${fila.doc_tipo ?? ''}-${fila.doc_id ?? ''}-${fila.fecha ?? ''}-${i}`;
            if (alAbrir) {
              return (
                <li key={clave} className="min-w-0">
                  <button type="button" onClick={() => alAbrir(fila)} className={`${FILA} hover:bg-slate-50 ${FOCO}`}>{contenido}</button>
                </li>
              );
            }
            if (href) {
              return (
                <li key={clave} className="min-w-0">
                  <Link href={href} className={`${FILA} hover:bg-slate-50 ${FOCO}`}>{contenido}</Link>
                </li>
              );
            }
            return (
              <li key={clave} className="min-w-0">
                <div className={FILA}>{contenido}</div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
