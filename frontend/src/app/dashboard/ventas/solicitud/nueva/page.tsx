"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CargandoSolicitudes } from '../CargandoSolicitudes';

// H9: se conserva por los enlaces viejos (el Hub ya va directo a /solicitud?new=1). Redirige a la lista con ?new=1, que
// abre el formulario y limpia la URL (U9), y mientras tanto muestra el esqueleto de la lista, no «Redirigiendo...».
export default function NuevaSolicitudRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/ventas/solicitud?new=1');
  }, [router]);
  return <CargandoSolicitudes />;
}
