'use client';
import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

/**
 * Contenido de un <Link> que da señal de carga apenas se hace clic (H9): mientras la navegación de ESE enlace está
 * pendiente (useLinkStatus de next/link) muestra el spinner y `textoPendiente`; si no, el ícono y el texto.
 * Debe renderizarse como hijo de <Link>: fuera de un Link, useLinkStatus nunca está pendiente.
 * El Link conserva su aria-label (p. ej. 'Nueva solicitud'), así el nombre accesible no cambia al cargar.
 */
export function ContenidoEnlace({ icon: Icono, children, textoPendiente = 'Abriendo…' }: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  textoPendiente?: string;
}) {
  const { pending } = useLinkStatus();
  if (pending) {
    return (
      <>
        <Loader2 size={15} className="animate-spin" />
        <span>{textoPendiente}</span>
      </>
    );
  }
  return (
    <>
      {Icono && <Icono size={15} />}
      <span>{children}</span>
    </>
  );
}
