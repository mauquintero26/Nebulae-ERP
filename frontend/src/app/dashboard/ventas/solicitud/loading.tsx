import { CargandoSolicitudes } from './CargandoSolicitudes';

// H9: Next lo muestra apenas empieza la navegación a /dashboard/ventas/solicitud y a /solicitud/nueva (el detalle
// /solicitud/[id] tiene su propio loading.tsx). En el build de producción el enlace lo precarga: sale al instante.
export default function Loading() {
  return <CargandoSolicitudes />;
}
