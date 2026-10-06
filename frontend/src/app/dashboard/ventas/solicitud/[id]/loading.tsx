import { RefreshCw } from 'lucide-react';

// T9B r1: la carga del detalle de una solicitud, igual a la que pinta solicitud/[id]/page.tsx mientras trae la SC (fondo
// blanco y el spinner centrado). Sin este archivo, solicitud/loading.tsx mostraba el esqueleto de la LISTA al abrir un
// detalle y después el spinner del detalle.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="w-full h-full flex items-center justify-center bg-white">
      <RefreshCw className="animate-spin text-indigo-600" size={28} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
