'use client';
import { RotateCcw } from 'lucide-react';
import { PASOS_SC, pasoSolicitud, infoEstadoSolicitud } from '@/lib/estados-solicitud';
import { PasosFlujo } from '@/components/flujo';
import { pasosConProgreso } from '@/lib/flujo';

// U15: los 4 pasos de la solicitud (Nueva, Asignada, Pendiente por confirmación, Confirmada). Avanzan solos (asignar el
// asesor, enviarla al cliente, la confirmación del cliente): ninguno se pone a mano. Los anteriores llevan ✓, el actual
// va resaltado y debajo se explica qué falta para avanzar (PASOS_SC de la librería: una sola fuente de nombres).
// 'Reiniciar solicitud' solo sale si `puedeReiniciar`; la página confirma con confirmar() y hace el PATCH (R30).
// La página no lo usa en Soporte Técnico (tiene su select) ni en Cancelada (se restaura desde la Papelera).
export function EstadoSolicitudPasos({ solicitud, puedeReiniciar, onReiniciar, reiniciando = false, ayuda }: {
  solicitud: { estado?: string | null };
  puedeReiniciar: boolean;
  onReiniciar: () => void;
  /** true mientras la página guarda el reinicio: el botón queda deshabilitado (sin doble clic). */
  reiniciando?: boolean;
  /**
   * T8A ronda 1: la ayuda del paso actual según el contexto (gana sobre la de PASOS_SC). La página la pasa en el último
   * paso cuando el avance ya sigue en una cotización o un pedido, o cuando la confirmación del cliente ya no vale.
   */
  ayuda?: string;
}) {
  // -1: un estado fuera de los pasos (ajeno): se muestra su etiqueta, sin marcar un paso falso.
  const paso = pasoSolicitud(solicitud?.estado);
  return (
    <div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Estado de la solicitud</p>
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        {paso >= 0 ? (
          <>
            {/* B4 T11 (FLUJO-documentos punto 3): los 4 pasos con la pieza común (los mismos círculos, colores y ✓ que la
                cadena de arriba). Las etiquetas se parten en dos líneas en esta tarjeta angosta (partirEtiquetas) y, si
                aun así no caben, la fila se desplaza dentro de la tarjeta. */}
            <div className="overflow-x-auto">
              <PasosFlujo variante="barra" pasos={pasosConProgreso(PASOS_SC, paso)} etiqueta="Estado de la solicitud" partirEtiquetas />
            </div>
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              {ayuda || PASOS_SC[paso].ayuda}
            </p>
          </>
        ) : (
          <p className="text-sm font-bold text-slate-700">{infoEstadoSolicitud(solicitud?.estado).label}</p>
        )}
        {puedeReiniciar && (
          <button type="button" onClick={onReiniciar} disabled={reiniciando}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-800 disabled:opacity-40 disabled:cursor-not-allowed">
            <RotateCcw size={12} /> Reiniciar solicitud
          </button>
        )}
      </div>
    </div>
  );
}
