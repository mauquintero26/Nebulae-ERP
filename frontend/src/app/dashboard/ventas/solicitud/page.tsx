import { Suspense } from 'react';
import SolicitudClient from './solicitud-client';
import { CargandoSolicitudes } from './CargandoSolicitudes';

export default function Page() {
  return (
    <Suspense fallback={<CargandoSolicitudes />}>
      <SolicitudClient />
    </Suspense>
  );
}
