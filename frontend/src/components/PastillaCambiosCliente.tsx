'use client';
import { useRouter } from 'next/navigation';
import { MessageSquareWarning } from 'lucide-react';
import type { pastillasCambiosCliente } from '@/lib/cambios-cliente';
import { PastillaMenuLateral } from './PastillaMenuLateral';

/**
 * B3 T18 (H28-cambios punto 11, C9, C22) y r1: las pastillas ámbar de AlertasBadge con los documentos que tienen cambios
 * pedidos por el cliente sin responder. Cuáles se pintan, su texto y adónde lleva cada una lo decide
 * pastillasCambiosCliente (lib/cambios-cliente.js): una a la lista de solicitudes y otra a la de cotizaciones, cada una
 * con su número, porque en cada lista está su marca. Son una cuenta aparte de los atrasados y se muestran aunque no
 * haya atrasados. La forma es la de PastillaMenuLateral (la misma de la roja), con el ámbar oscuro en el ícono y en la
 * insignia del menú contraído (contraste, r1).
 */
export function PastillasCambiosCliente({ pastillas, colapsado = false }: {
  pastillas: ReturnType<typeof pastillasCambiosCliente>;
  colapsado?: boolean;
}) {
  const router = useRouter();
  return (
    <>
      {pastillas.map((p) => (
        <PastillaMenuLateral key={p.clave} onClick={() => router.push(p.ruta)} texto={p.texto} cantidad={p.cantidad}
          colapsado={colapsado} icono={MessageSquareWarning}
          claseBoton="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200" claseIcono="text-amber-700"
          claseInsignia="bg-amber-700 text-white" title={p.titulo} aria-label={p.ariaLabel} />
      ))}
    </>
  );
}
