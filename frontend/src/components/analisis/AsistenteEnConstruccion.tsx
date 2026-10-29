'use client';

import { useId } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * R2 (Bloque 4, T5C; ia_en_analisis = «Dejarlos visibles con el aviso…»): el asistente con IA de las pestañas Análisis
 * mientras llega el de verdad (Bloque 5). PanelAnalisis lo pinta al final de toda pestaña.
 *  - Una tarjeta con el título del asistente, la pastilla ámbar del aviso, el texto 'El asistente con IA llega en el
 *    Bloque 5: responderá con los datos reales de esta pantalla.', las preguntas de ejemplo como chips deshabilitados y
 *    la caja de texto deshabilitada.
 *  - No llama a ningún endpoint, no usa temporizadores y no responde nada (ni un texto fijo ni uno simulado): no tiene
 *    estado.
 *  - Es el ÚNICO lugar con el aviso de IA de la app: el Bloque 5 (su R16) lo cambia aquí, y ninguna pantalla escribe el
 *    suyo (T24 lo revisa con Grep).
 *  - Los chips y la caja deshabilitados conservan el contraste del texto (slate-600 o más oscuro): se leen igual.
 * Clases de Tailwind literales, sin variantes de modo oscuro.
 */

export type PropsAsistenteEnConstruccion = {
  /** Por ejemplo 'Copilot de Ventas' (RP69; sin la prop asistente, PanelAnalisis pasa 'Asistente con IA'). */
  titulo: string;
  /** Las preguntas de ejemplo de la pantalla (sin códigos crudos ni emojis); vacío, ninguna. */
  ejemplos?: ReadonlyArray<string>;
};

export function AsistenteEnConstruccion({ titulo, ejemplos = [] }: PropsAsistenteEnConstruccion) {
  const idTitulo = useId();
  const idPastilla = useId();
  const idAviso = useId();
  const preguntas = ejemplos.filter((e) => typeof e === 'string' && e.trim());

  return (
    // T5C r1 (M20): la región se llama «Copilot de Ventas En construcción» (quien navega por regiones oye el aviso).
    <section aria-labelledby={`${idTitulo} ${idPastilla}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Sparkles size={18} />
        </span>
        <h3 id={idTitulo} className="min-w-0 break-words text-sm font-bold text-slate-900">{titulo}</h3>
        <span id={idPastilla} className="shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-300">
          En construcción
        </span>
      </div>
      <p id={idAviso} className="mt-2 text-sm text-slate-700">
        El asistente con IA llega en el Bloque 5: responderá con los datos reales de esta pantalla.
      </p>
      {preguntas.length > 0 && (
        <ul aria-label="Preguntas de ejemplo" className="mt-3 flex flex-wrap gap-2">
          {preguntas.map((pregunta, i) => (
            <li key={`${pregunta}-${i}`} className="min-w-0 max-w-full">
              <button
                type="button"
                disabled
                aria-describedby={idAviso}
                className="max-w-full cursor-not-allowed whitespace-normal break-words rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-left text-xs font-medium text-slate-600"
              >
                {pregunta}
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        type="text"
        disabled
        aria-label={`Pregunta para ${titulo}`}
        aria-describedby={idAviso}
        placeholder="Escribe tu pregunta…"
        className="mt-3 block w-full min-w-0 cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 placeholder:text-slate-600"
      />
    </section>
  );
}
