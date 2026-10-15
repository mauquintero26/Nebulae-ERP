import { RefreshCw } from 'lucide-react';

// T9B r1: la carga del detalle de una solicitud, igual a la que pinta solicitud/[id]/page.tsx mientras trae la SC (fondo
// blanco y el spinner centrado). Revisión final (F6): solo envuelve la página de [id] (mientras llega su código); NO evita
// la carga de solicitud/loading.tsx, que Next pinta antes porque envuelve también al segmento [id]. Lo que evita el
// esqueleto de la LISTA al abrir un detalle es que solicitud/loading.tsx sea una señal neutra.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="w-full h-full flex items-center justify-center bg-white">
      <RefreshCw className="animate-spin text-indigo-600" size={28} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
