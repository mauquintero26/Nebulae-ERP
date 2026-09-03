import { Suspense } from 'react';
import VentaClient from './venta-client';

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-slate-500">Cargando...</div>}>
      <VentaClient />
    </Suspense>
  );
}
