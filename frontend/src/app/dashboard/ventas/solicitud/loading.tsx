import { CargandoSolicitudes } from './CargandoSolicitudes';

// H9: Next lo muestra apenas empieza la navegación a /dashboard/ventas/solicitud y a sus rutas hijas (el detalle
// /solicitud/[id] y /solicitud/nueva). En el build de producción el enlace lo precarga, así que sale al instante.
export default function Loading() {
  return <CargandoSolicitudes />;
}
