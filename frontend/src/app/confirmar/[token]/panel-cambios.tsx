'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { largoTexto } from '@/lib/chatter';
import {
  MAX_COMENTARIO_CAMBIOS, TIPO_CAMBIOS, TIPO_NO_LA_NECESITA, limpiarComentario, puedeEnviarCambios, textosPanelCambios,
} from '@/lib/confirmacion-publica';
import { TIPOS_DOCUMENTO, coloresBotonPrincipal } from '@/lib/documento-comercial';

export type TipoCambios = 'CAMBIOS' | 'NO_LA_NECESITA';

// R8: «Ya no la necesito» solo existe en la solicitud.
const OPCIONES: { valor: TipoCambios; etiqueta: string }[] = [
  { valor: TIPO_CAMBIOS, etiqueta: 'Quiero cambiar algo' },
  { valor: TIPO_NO_LA_NECESITA, etiqueta: 'Ya no la necesito' },
];

/**
 * «Pedir cambios» desde el enlace del cliente (B3 T15: H28-cambios punto 6 y U22-cambios punto 6; C9), el mismo panel
 * para la solicitud y la cotización. Reemplaza a los botones al tocar 'Pedir cambios'.
 * - En la SC, las opciones 'Quiero cambiar algo' y 'Ya no la necesito' (R8); en la COT solo cambios.
 * - '¿Qué quieres cambiar?' con un ejemplo, el contador x/1000 (con la misma limpieza del backend) y 'Enviar cambios',
 *   habilitado solo con puedeEnviarCambios (10 a 1000 caracteres; 'Ya no la necesito' admite el comentario vacío).
 * - El 422 (o un error de red) llega en `error` y se muestra aquí mismo sin borrar lo escrito: el texto vive en este
 *   panel, que sigue montado mientras la página espera la respuesta.
 * - El comentario se envía tal cual: React lo pinta como texto en todas partes.
 * - En el celular la fila de botones queda fija abajo del panel, para que se vea con el teclado abierto.
 */
export function PanelPedirCambios({ tipo, asesor, marca, onEnviar, enviando, error, onVolver }: {
  tipo: 'SC' | 'COT';
  /** El nombre del asesor (documento.atendido_por), o null. */
  asesor?: string | null;
  /** La marca de la respuesta pública: el botón principal lleva sus colores. */
  marca: unknown;
  onEnviar: (tipoCambios: TipoCambios, comentario: string) => void;
  enviando: boolean;
  error?: string | null;
  onVolver: () => void;
}) {
  const [opcion, setOpcion] = useState<TipoCambios>(TIPO_CAMBIOS);
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  // Al abrir, el cursor va al cuadro de texto (y la página se desplaza hasta el panel).
  useEffect(() => {
    campo.current?.focus();
  }, []);

  const tipoCambios: TipoCambios = tipo === 'SC' ? opcion : TIPO_CAMBIOS;
  const textos = textosPanelCambios(tipo, tipoCambios, asesor);
  const largo = largoTexto(limpiarComentario(texto));
  const puede = puedeEnviarCambios(texto, tipoCambios);
  const boton = coloresBotonPrincipal(marca, TIPOS_DOCUMENTO[tipo].variante);
  const describe = [`${id}-contador`, `${id}-ayuda`, error ? `${id}-error` : ''].filter(Boolean).join(' ');

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="mx-auto mt-4 w-full max-w-[820px] rounded-2xl bg-white px-5 pt-5 text-gray-900 shadow-lg print:hidden sm:px-6 sm:pb-6"
    >
      <h2 id={`${id}-titulo`} className="text-lg font-bold">Pedir cambios</h2>

      {tipo === 'SC' && (
        <fieldset className="mt-3" disabled={enviando}>
          <legend className="sr-only">¿Qué quieres hacer?</legend>
          <div className="flex flex-col gap-2 sm:flex-row">
            {OPCIONES.map((o) => (
              <label
                key={o.valor}
                className={`flex min-h-[44px] flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  opcion === o.valor ? 'border-gray-900 bg-gray-50 font-semibold' : 'border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name={`${id}-opcion`}
                  value={o.valor}
                  checked={opcion === o.valor}
                  onChange={() => setOpcion(o.valor)}
                  className="h-4 w-4 accent-gray-900"
                />
                {o.etiqueta}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label htmlFor={`${id}-comentario`} className="mt-4 block text-sm font-semibold">
        {textos.pregunta}
      </label>
      <textarea
        id={`${id}-comentario`}
        ref={campo}
        rows={4}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={textos.ejemplo}
        disabled={enviando}
        aria-describedby={describe}
        aria-invalid={error ? true : undefined}
        className="mt-1 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:bg-gray-50"
      />
      <p
        id={`${id}-contador`}
        className={`mt-1 text-right text-xs tabular-nums ${largo > MAX_COMENTARIO_CAMBIOS ? 'font-semibold text-red-700' : 'text-gray-500'}`}
      >
        {largo}/{MAX_COMENTARIO_CAMBIOS}
      </p>
      <p id={`${id}-ayuda`} className="mt-2 text-sm text-gray-700">{textos.explicacion}</p>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-5 mt-4 flex gap-2 rounded-b-2xl border-t border-gray-200 bg-white px-5 py-3 sm:static sm:mx-0 sm:justify-end sm:rounded-none sm:border-0 sm:px-0 sm:pb-0">
        <button
          type="button"
          onClick={() => onEnviar(tipoCambios, texto)}
          disabled={!puede || enviando}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          style={{ background: boton.fondo, color: boton.texto }}
        >
          <Send size={16} aria-hidden="true" />
          {enviando ? 'Enviando…' : textos.boton}
        </button>
        <button
          type="button"
          onClick={onVolver}
          disabled={enviando}
          className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          Volver
        </button>
      </div>
    </section>
  );
}
