'use client';

import { useId, useState } from 'react';
import { PERIODOS, borradorPersonalizado, errorPeriodo } from '@/lib/analisis';
import type { ClavePeriodo, PeriodoAnalisis } from '@/lib/analisis';
import { diaColombia } from '@/lib/fechas-colombia';

/**
 * ANALISIS-base punto 2 (Bloque 4, T5C; R7): el selector de período de la pestaña Análisis.
 *  - Píldoras con PERIODOS (7 días, 30 días, 90 días, Este mes, 12 meses y Personalizado; aria-pressed) que se vuelven un
 *    <select> en anchos chicos: la píldora o el select según el ancho del panel (container query @xl de la raíz
 *    @container de PanelAnalisis; fuera de un @container queda el select).
 *  - 'Personalizado' muestra dos <input type="date"> (Desde y Hasta, a lo sumo hoy en Colombia) con el botón 'Aplicar':
 *    se abren con las fechas aplicadas o con las del período que se ve (borradorPersonalizado). Fechas inválidas no se
 *    aplican: el error va en línea con el MISMO texto que daría el servidor (errorPeriodo, los seis de core/periodos.py).
 *  - Debajo, `comparado` ('Comparado con 5 ago – 3 sept', textoComparado de periodo.comparado del servidor).
 *  - Controlado: `periodo` es el aplicado y alCambiar recibe el nuevo (PanelAnalisis lo guarda en analisis:<modulo>).
 * Foco visible con outline (nunca outline-none). Clases de Tailwind literales, sin variantes de modo oscuro; los textos
 * con al menos 4,5:1.
 */

export type PropsSelectorPeriodo = {
  /** El período aplicado. */
  periodo: PeriodoAnalisis;
  alCambiar: (periodo: PeriodoAnalisis) => void;
  /** 'Comparado con 5 ago – 3 sept' (textoComparado). Sin él, la línea queda vacía (sin saltos al llegar). */
  comparado?: string | null;
  /** periodo.desde y periodo.hasta del contrato: con ellos se abre 'Personalizado' si el aplicado es otro. */
  periodoDatos?: { desde?: string | null; hasta?: string | null } | null;
  /** 'AAAA-MM-DD' de Colombia (por defecto, diaColombia()): el máximo de las fechas. */
  hoy?: string;
};

const FOCO = 'outline-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
const PILDORA = `inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold transition-colors ${FOCO}`;
const PILDORA_ACTIVA = 'border-slate-900 bg-slate-900 text-white';
const PILDORA_INACTIVA = 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
const CAMPO = `block w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 ${FOCO}`;

type PropsEditor = {
  inicial: { desde: string; hasta: string };
  hoy: string;
  alAplicar: (periodo: PeriodoAnalisis) => void;
};

/** Las fechas de 'Personalizado' con su error en línea. Se monta de nuevo (key) cuando cambia el personalizado aplicado. */
function EditorPersonalizado({ inicial, hoy, alAplicar }: PropsEditor) {
  const idDesde = useId();
  const idHasta = useId();
  const idError = useId();
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [error, setError] = useState<string | null>(null);

  const aplicar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const periodo: PeriodoAnalisis = { clave: 'personalizado', desde, hasta };
    const texto = errorPeriodo(periodo, hoy);
    setError(texto);
    if (!texto) alAplicar(periodo);
  };
  const conError = error ? true : undefined;
  const descrito = error ? idError : undefined;

  return (
    // noValidate: el error es el del servidor (errorPeriodo), no la burbuja del navegador por el max.
    <form noValidate onSubmit={aplicar} aria-label="Período personalizado" className="mt-2 flex min-w-0 flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 basis-36">
        <label htmlFor={idDesde} className="block text-xs font-semibold text-slate-700">Desde</label>
        <input
          id={idDesde}
          type="date"
          value={desde}
          max={hoy}
          onChange={(e) => { setDesde(e.target.value); setError(null); }}
          aria-invalid={conError}
          aria-describedby={descrito}
          className={`mt-1 ${CAMPO}`}
        />
      </div>
      <div className="min-w-0 flex-1 basis-36">
        <label htmlFor={idHasta} className="block text-xs font-semibold text-slate-700">Hasta</label>
        <input
          id={idHasta}
          type="date"
          value={hasta}
          max={hoy}
          onChange={(e) => { setHasta(e.target.value); setError(null); }}
          aria-invalid={conError}
          aria-describedby={descrito}
          className={`mt-1 ${CAMPO}`}
        />
      </div>
      <button type="submit" className={`shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 ${FOCO}`}>
        Aplicar
      </button>
      {error && (
        <p id={idError} role="alert" className="w-full text-xs font-semibold text-rose-700">{error}</p>
      )}
    </form>
  );
}

export function SelectorPeriodo({ periodo, alCambiar, comparado, periodoDatos, hoy }: PropsSelectorPeriodo) {
  const idSelect = useId();
  // 'Personalizado' elegido pero todavía sin aplicar: se ven las fechas y el período aplicado sigue siendo el de antes.
  const [abierto, setAbierto] = useState(false);
  const elegido: ClavePeriodo = abierto ? 'personalizado' : periodo.clave;
  const diaHoy = hoy ?? diaColombia();

  const elegir = (clave: ClavePeriodo) => {
    if (clave === 'personalizado') {
      setAbierto(true);
      return;
    }
    setAbierto(false);
    if (clave !== periodo.clave) alCambiar({ clave });
  };
  const aplicarPersonalizado = (nuevo: PeriodoAnalisis) => {
    setAbierto(false);
    alCambiar(nuevo);
  };
  const inicial = borradorPersonalizado(periodo, periodoDatos);

  return (
    <div className="min-w-0">
      <div role="group" aria-label="Período" className="hidden min-w-0 flex-wrap gap-1.5 @xl:flex">
        {PERIODOS.map((p) => (
          <button
            key={p.clave}
            type="button"
            aria-pressed={p.clave === elegido}
            onClick={() => elegir(p.clave)}
            className={`${PILDORA} ${p.clave === elegido ? PILDORA_ACTIVA : PILDORA_INACTIVA}`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      <div className="min-w-0 @xl:hidden">
        <label htmlFor={idSelect} className="sr-only">Período</label>
        <select
          id={idSelect}
          value={elegido}
          onChange={(e) => elegir(e.target.value as ClavePeriodo)}
          className={`block w-full min-w-0 max-w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 ${FOCO}`}
        >
          {PERIODOS.map((p) => <option key={p.clave} value={p.clave}>{p.etiqueta}</option>)}
        </select>
      </div>
      {elegido === 'personalizado' && (
        <EditorPersonalizado
          key={`${periodo.clave}|${periodo.desde ?? ''}|${periodo.hasta ?? ''}`}
          inicial={inicial}
          hoy={diaHoy}
          alAplicar={aplicarPersonalizado}
        />
      )}
      <p className="mt-1.5 min-h-4 text-xs text-slate-600">{comparado ?? ''}</p>
    </div>
  );
}
