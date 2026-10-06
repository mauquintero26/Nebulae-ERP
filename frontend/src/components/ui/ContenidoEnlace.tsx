'use client';
import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

/**
 * Contenido de un <Link> que da señal de carga al hacer clic (H9): mientras la navegación de ESE enlace está pendiente
 * (useLinkStatus de next/link) muestra el spinner y `textoPendiente`; si no, el ícono y el texto.
 * - Las dos etiquetas van apiladas en la misma celda (grid) y se alterna su visibilidad: el enlace conserva el ancho de
 *   la más larga y no salta.
 * - El cambio espera ~100 ms (transition-delay de visibility, como recomienda la doc de useLinkStatus): una navegación
 *   rápida no parpadea. Al terminar vuelve sin espera.
 * - Una región sr-only con aria-live, siempre montada, anuncia `textoPendiente` a los lectores de pantalla.
 * Debe renderizarse como hijo de <Link>: fuera de un Link, useLinkStatus nunca está pendiente. El Link conserva su
 * aria-label (p. ej. 'Nueva solicitud'), así el nombre accesible no cambia al cargar.
 */
export function ContenidoEnlace({ icon: Icono, children, textoPendiente = 'Abriendo…' }: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  textoPendiente?: string;
}) {
  const { pending } = useLinkStatus();
  // duration-0 con delay: la visibilidad cambia de golpe, pero solo 100 ms después de empezar a navegar.
  const capa = `col-start-1 row-start-1 inline-flex items-center justify-center gap-2 transition-[visibility] duration-0 ${
    pending ? 'delay-100' : 'delay-0'}`;
  return (
    <>
      <span className="grid">
        <span className={`${capa} ${pending ? 'invisible' : 'visible'}`}>
          {Icono && <Icono size={15} />}
          <span>{children}</span>
        </span>
        <span aria-hidden="true" className={`${capa} ${pending ? 'visible' : 'invisible'}`}>
          <Loader2 size={15} className="animate-spin" />
          <span>{textoPendiente}</span>
        </span>
      </span>
      <span className="sr-only" aria-live="polite">{pending ? textoPendiente : ''}</span>
    </>
  );
}
