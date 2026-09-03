import { Suspense } from 'react';
import CotizacionClient from './cotizacion-client';

export default function CotizacionPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-slate-500">Cargando...</div>}>
      <CotizacionClient />
    </Suspense>
  );
}
