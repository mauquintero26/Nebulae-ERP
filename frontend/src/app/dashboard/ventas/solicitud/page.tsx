import { Suspense } from 'react';
import SolicitudClient from './solicitud-client';

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-slate-500">Cargando...</div>}>
      <SolicitudClient />
    </Suspense>
  );
}
