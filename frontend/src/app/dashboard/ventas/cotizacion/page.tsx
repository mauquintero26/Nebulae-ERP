import { Suspense } from 'react';
import CotizacionClient from './cotizacion-client';
import { CargandoCotizaciones } from './CargandoCotizaciones';

// B4 T9 r1 (A2): el fallback del Suspense es el esqueleto de la lista (la misma geometría: al llegar no salta), no un
// «Cargando...» centrado en toda la pantalla.
export default function CotizacionPage() {
  return (
    <Suspense fallback={<CargandoCotizaciones />}>
      <CotizacionClient />
    </Suspense>
  );
}
