'use client';

import { useCallback, useMemo, useState } from 'react';
import { Package, Truck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAvisos } from '@/components/ui';
import type { ItemMenuFila, TableroKanbanEstado } from '@/components/ui';
import { accionesTableroPedidos, accionesTarjetaPedido } from '@/lib/kanban-ventas';
import { getUsuarioActual } from './flujo';

/** Autor de los cambios hechos desde el tablero (Actividad); sin sesión, el servidor usa el correo del usuario. */
const autorActual = () => { const u = getUsuarioActual(); return u.name || u.email || undefined; };

/** Lo que el hook necesita de un pedido del tablero (FilaPedido de Pedidos de venta y PedidoWeb de E-Commerce). */
type PedidoDelTablero = { id: number | string; numero?: string | null; estado?: string | null };
/** El origen y el destino de una tarjeta (D39): lo que se recarga del tablero al terminar. */
type Columnas = ReadonlyArray<string>;

/**
 * B4 T24 f2 (F47): las acciones del tablero de pedidos, las MISMAS en Pedidos de venta y en E-Commerce (antes, unas 70 líneas copiadas).
 * La regla de error y de recarga vive en accionesTableroPedidos (lib/kanban-ventas.js, probada con un apiFetch falso); aquí solo se
 * cablea con React: los avisos (useAvisos), el autor, la ventana del motivo y los ítems del ⋯ de la tarjeta.
 *  - cambiarDesdeTablero → onCambio; accionDesdeTablero → onAccion ('facturar' confirma y factura; 'cancelar' abre ModalMotivo);
 *  - accionesTarjeta → «Marcar En tránsito» y «Marcar En proceso» (accionesTarjetaPedido), solo si el rol mueve pedidos (`mover`):
 *    para otro rol darían 403;
 *  - cancelando, cancelarConMotivo y cerrarCancelacion → ModalMotivo; pedirCancelacion(p) la abre desde el ⋯ de la fila (B4.1, P10).
 * `recargarTrasCambio` es lo que mueve un cambio en la pantalla (pestañas, franja y tarjetas); del tablero, solo el origen y el destino.
 */
export function useAccionesTableroPedidos<P extends PedidoDelTablero>({ tablero, recargarTrasCambio, mover }: {
  tablero: TableroKanbanEstado<P>;
  recargarTrasCambio: () => void;
  mover: boolean;
}) {
  const { avisar, avisarError, confirmar } = useAvisos();
  const { recargar: recargarTablero } = tablero;
  const acciones = useMemo(() => accionesTableroPedidos({
    apiFetch, autor: autorActual, confirmar, avisar, avisarError, recargarTablero, recargarTrasCambio,
  }), [confirmar, avisar, avisarError, recargarTablero, recargarTrasCambio]);

  const cambiarDesdeTablero = useCallback(
    (p: P, resultado: { estado: string }) => acciones.cambiar(p, resultado.estado), [acciones],
  );
  const [cancelando, setCancelando] = useState<{ pedido: P; columnas: Columnas } | null>(null);
  const accionDesdeTablero = useCallback((p: P, resultado: { accion: string }, origen: string, destino: string) => {
    if (resultado.accion === 'cancelar') setCancelando({ pedido: p, columnas: [origen, destino] });
    else if (resultado.accion === 'facturar') void acciones.facturar(p, [origen, destino]);
  }, [acciones]);
  // B4.1 (P10): «Cancelar pedido» del ⋯ de la fila abre esta misma ventana, sin columnas del tablero que recargar.
  const pedirCancelacion = useCallback((p: P) => setCancelando({ pedido: p, columnas: [] }), []);
  const cancelarConMotivo = useCallback(async (motivo: string) => {
    if (!cancelando) return;
    await acciones.cancelar(cancelando.pedido, motivo, cancelando.columnas);
  }, [acciones, cancelando]);
  const cerrarCancelacion = useCallback(() => setCancelando(null), []);
  const accionesTarjeta = useCallback((p: P): ItemMenuFila[] => (mover ? accionesTarjetaPedido(p) : []).map((a) => ({
    etiqueta: a.etiqueta, icono: a.estado === 'EN_TRANSITO' ? Truck : Package, onClick: () => { void acciones.marcar(p, a.estado); },
  })), [acciones, mover]);

  return { cambiarDesdeTablero, accionDesdeTablero, accionesTarjeta, cancelando, pedirCancelacion, cancelarConMotivo, cerrarCancelacion };
}
