'use client';
import { useRouter } from 'next/navigation';
import { MessageSquareWarning } from 'lucide-react';
import { RUTA_CAMBIOS_CLIENTE } from '@/lib/cambios-cliente';
import { TONES } from '@/components/ui';

/**
 * B3 T18 (H28-cambios punto 11, C22): la segunda pastilla de AlertasBadge, en ámbar, con los documentos que tienen
 * cambios pedidos por el cliente sin responder (`cambios_cliente` de GET /ventas/alertas/resumen: SC y COT; el asesor ve
 * solo las suyas). Es una cuenta aparte de los atrasados y se muestra aunque no haya atrasados. El clic lleva a la lista
 * de solicitudes, donde está la marca «Cambios pedidos». Con el menú contraído, solo el ícono con el número. El texto
 * (`texto`) lo arma textoCambiosCliente (lib/cambios-cliente.js); quien la monta no la pinta sin texto.
 */
export function PastillaCambiosCliente({ texto, cantidad, colapsado = false }: {
  texto: string;
  cantidad: number | string;
  colapsado?: boolean;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(RUTA_CAMBIOS_CLIENTE)}
      className={`relative flex w-full items-center rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors hover:bg-amber-200 ${TONES.warning} ${colapsado ? 'justify-center' : ''}`}
      title="Solicitudes y cotizaciones con cambios pedidos por el cliente"
      aria-label={`${texto}: ver las solicitudes`}
    >
      <MessageSquareWarning className={`w-5 h-5 shrink-0 text-amber-600 ${colapsado ? '' : 'mr-3'}`} />
      {colapsado ? (
        <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-white">
          {cantidad}
        </span>
      ) : (
        <span className="truncate">{texto}</span>
      )}
    </button>
  );
}
