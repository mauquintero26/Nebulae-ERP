'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { TABLE } from '@/lib/design-system';
import { saleConEsc } from '@/lib/tabla';

/**
 * «Pantalla completa» de la tabla estándar (Bloque 4, T4D r1, punto 4), para no repetir el estado en cada pantalla:
 *
 *    const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
 *    …
 *    {capa}
 *    <section ref={refTarjeta} className={claseTarjeta}>
 *      <BarraTabla … pantallaCompleta={{ completa, alternar }} />
 *      <TablaEstandar … />
 *    </section>
 *
 *  - claseTarjeta: TABLE.tarjeta, o TABLE.tarjetaCompleta (fixed inset-4 z-40, overscroll-contain; su pie deja libre la
 *    esquina del botón flotante de la IA con pr-20).
 *  - capa: con la pantalla completa, la capa fija z-[39] de TABLE.capaCompleta, con el oscurecido; va justo antes de la
 *    tarjeta (en el mismo contexto de apilamiento, así queda siempre debajo de ella). Tapa la página de atrás: los clics
 *    y la rueda no llegan a ella, y un clic en la capa sale de la pantalla completa. Sin pantalla completa, null.
 *  - Esc sale solo si nada más lo atendió (saleConEsc de lib/tabla.js): ni un menú, el filtro, la búsqueda o un arrastre
 *    (defaultPrevented o stopPropagation), ni un Modal, ModalMotivo o confirmación encima (el foco en un [role=dialog],
 *    [role=alertdialog] o [aria-modal=true] fuera de la tarjeta, o uno de esos abierto). Se escucha en window, en la
 *    fase de burbuja: los demás lo atienden antes.
 *  - refTarjeta: para saber si un diálogo está fuera de la tarjeta.
 * Se usa DESESTRUCTURADO: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render»
 * en cada lectura de pantalla.capa o pantalla.claseTarjeta (revisión de T5D r1).
 * No atrapa el foco (no lo pide el ruling).
 */

export type PantallaCompleta = {
  completa: boolean;
  alternar: () => void;
  salir: () => void;
  claseTarjeta: string;
  capa: ReactNode;
  refTarjeta: RefObject<HTMLElement | null>;
};

const DIALOGOS = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/** Hay un diálogo encima de la tabla: el foco está en uno que no es de la tarjeta, o hay uno modal abierto fuera de ella. */
function hayDialogoEncima(tarjeta: HTMLElement | null): boolean {
  const activo = document.activeElement;
  const conFoco = activo instanceof Element ? activo.closest(DIALOGOS) : null;
  if (conFoco && !tarjeta?.contains(conFoco)) return true;
  return Array.from(document.querySelectorAll('[aria-modal="true"]')).some((d) => !tarjeta?.contains(d));
}

export function usePantallaCompleta(): PantallaCompleta {
  const [completa, setCompleta] = useState(false);
  const refTarjeta = useRef<HTMLElement | null>(null);
  const salir = useCallback(() => setCompleta(false), []);
  const alternar = useCallback(() => setCompleta((c) => !c), []);

  useEffect(() => {
    if (!completa) return undefined;
    const alTeclear = (e: KeyboardEvent) => {
      if (!saleConEsc({ tecla: e.key, defaultPrevented: e.defaultPrevented, dialogoEncima: hayDialogoEncima(refTarjeta.current) })) return;
      setCompleta(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [completa]);

  return {
    completa,
    alternar,
    salir,
    claseTarjeta: completa ? TABLE.tarjetaCompleta : TABLE.tarjeta,
    capa: completa ? <div aria-hidden="true" className={TABLE.capaCompleta} onClick={salir} /> : null,
    refTarjeta,
  };
}
