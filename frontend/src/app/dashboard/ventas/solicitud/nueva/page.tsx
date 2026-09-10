"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NuevaSolicitudRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/ventas/solicitud');
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-slate-500">Redirigiendo...</p>
    </div>
  );
}
