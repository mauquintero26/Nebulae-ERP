'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { apiFetch, hayReautenticacionPendiente } from '@/lib/api';
import { RUTA_HUB_VENTAS, textoAtrasados } from '@/lib/hub-ventas';
import { pastillasCambiosCliente } from '@/lib/cambios-cliente';
import { KPI_COLOR_MAP } from '@/lib/design-system';
import { PastillaMenuLateral } from './PastillaMenuLateral';
import { PastillasCambiosCliente } from './PastillaCambiosCliente';

const ROJO = KPI_COLOR_MAP.red;

/**
 * Aviso de documentos de Ventas atrasados (GET /ventas/alertas/resumen, cada 5 minutos). T11 (V1): es un elemento del
 * menú lateral (Sidebar), arriba; antes flotaba fijo arriba a la derecha y tapaba los botones de las cabeceras y de las
 * ventanas. Con el menú contraído (`colapsado`) se ve solo el ícono con el número en una insignia; con 0 atrasados no
 * se muestra. El clic lleva al Hub de Ventas.
 * B3 T18 (H28-cambios punto 11, C22): debajo, las pastillas ámbar de cambios del cliente (PastillasCambiosCliente), con
 * la misma respuesta. Son una cuenta aparte y se muestran aunque no haya atrasados. r1: una por lista (solicitudes y
 * cotizaciones, cambios_cliente_sc y cambios_cliente_cot), y las dos formas salen de PastillaMenuLateral.
 */
export function AlertasBadge({ colapsado = false }: { colapsado?: boolean }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [cambios, setCambios] = useState<unknown>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      // H23: con la ventana de re-ingreso abierta o la pestana oculta no se consulta (no se acumulan peticiones
      // esperando el re-ingreso en una pestana olvidada).
      if (hayReautenticacionPendiente() || document.visibilityState === 'hidden') return;
      try {
        const res = await apiFetch('/ventas/alertas/resumen');
        if (mounted) setCount(res?.data?.atrasados ?? 0);
        if (mounted) setCambios(res?.data ?? null);
      } catch {}
    }
    load();
    const interval = setInterval(load, 5 * 60 * 1000);  // cada 5 minutos
    // Al volver a la pestana se actualiza enseguida (mientras estuvo oculta no se consulto).
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, []);

  const texto = textoAtrasados(count);
  const pastillas = pastillasCambiosCliente(cambios);
  if (!texto && pastillas.length === 0) return null;

  // Sin atrasados no se pinta la roja; las de cambios del cliente salen igual.
  return (
    <div className="px-3 pt-4 shrink-0 space-y-2">
      {texto && <PastillaMenuLateral
        onClick={() => router.push(RUTA_HUB_VENTAS)}
        texto={texto} cantidad={count} colapsado={colapsado} icono={AlertTriangle}
        claseBoton={`hover:bg-red-100 ${ROJO.bg} ${ROJO.text} ${ROJO.border}`} claseIcono={ROJO.iconText}
        claseInsignia="bg-red-600 text-white"
        title="Documentos atrasados sin atender"
        aria-label={`${texto} sin atender: ver el Hub de Ventas`}
      />}
      <PastillasCambiosCliente pastillas={pastillas} colapsado={colapsado} />
    </div>
  );
}
