import { Suspense } from 'react';
import VentaClient from './venta-client';
import { CargandoPedidos } from './CargandoPedidos';

// B4 T10 (el patrón de T8 r1 y T9 r1, A2): el fallback del Suspense es el esqueleto de la lista (la misma geometría: al
// llegar no salta), no un «Cargando...» centrado en toda la pantalla.
export default function Page() {
  return (
    <Suspense fallback={<CargandoPedidos />}>
      <VentaClient />
    </Suspense>
  );
}
