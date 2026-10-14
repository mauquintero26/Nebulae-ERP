'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { apiFetch, hayReautenticacionPendiente } from '@/lib/api';
import { RUTA_HUB_VENTAS, textoAtrasados } from '@/lib/hub-ventas';
import { KPI_COLOR_MAP } from '@/lib/design-system';

const ROJO = KPI_COLOR_MAP.red;

/**
 * Aviso de documentos de Ventas atrasados (GET /ventas/alertas/resumen, cada 5 minutos). T11 (V1): es un elemento del
 * menú lateral (Sidebar), arriba; antes flotaba fijo arriba a la derecha y tapaba los botones de las cabeceras y de las
 * ventanas. Con el menú contraído (`colapsado`) se ve solo el ícono con el número en una insignia; con 0 atrasados no
 * se muestra. El clic lleva al Hub de Ventas.
 */
export function AlertasBadge({ colapsado = false }: { colapsado?: boolean }) {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      // H23: con la ventana de re-ingreso abierta o la pestana oculta no se consulta (no se acumulan peticiones
      // esperando el re-ingreso en una pestana olvidada).
      if (hayReautenticacionPendiente() || document.visibilityState === 'hidden') return;
      try {
        const res = await apiFetch('/ventas/alertas/resumen');
        if (mounted) setCount(res?.data?.atrasados ?? 0);
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
  if (!texto) return null;

  return (
    <div className="px-3 pt-4 shrink-0">
      <button
        type="button"
        onClick={() => router.push(RUTA_HUB_VENTAS)}
        className={`relative flex w-full items-center rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors hover:bg-red-100 ${ROJO.bg} ${ROJO.text} ${ROJO.border} ${colapsado ? 'justify-center' : ''}`}
        title="Documentos atrasados sin atender"
        aria-label={`${texto} sin atender: ver el Hub de Ventas`}
      >
        <AlertTriangle className={`w-5 h-5 shrink-0 ${ROJO.iconText} ${colapsado ? '' : 'mr-3'}`} />
        {colapsado ? (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">
            {count}
          </span>
        ) : (
          <span className="truncate">{texto}</span>
        )}
      </button>
    </div>
  );
}
