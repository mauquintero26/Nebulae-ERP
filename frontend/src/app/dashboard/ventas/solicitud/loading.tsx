import { LOADING } from '@/lib/design-system';

// H9 + revisión final (F6, SC M1): Next 16 envuelve con este loading.tsx TODO lo que cuelga de /dashboard/ventas/solicitud:
// la lista, /solicitud/nueva y también el segmento [id] (sin PPR el prefetch se corta aquí, así que el detalle nunca
// llega precargado). Por eso es una señal de carga NEUTRA, sin la forma de la lista: al abrir una solicitud ya no se pinta
// el esqueleto de la lista. Ese esqueleto (CargandoSolicitudes) sigue en el fallback del Suspense de solicitud/page.tsx,
// que solo aplica dentro de la lista, y en /solicitud/nueva.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className={`${LOADING.wrapper} gap-3 text-sm font-medium text-slate-500`}>
      <div aria-hidden="true" className={LOADING.spinner} />
      Cargando…
    </div>
  );
}
