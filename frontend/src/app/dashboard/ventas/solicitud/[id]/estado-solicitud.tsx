'use client';
import { RotateCcw } from 'lucide-react';
import { PASOS_SC, pasoSolicitud, infoEstadoSolicitud } from '@/lib/estados-solicitud';

// U15: los 4 pasos de la solicitud (Nueva, Asignada, Pendiente por confirmación, Confirmada). Avanzan solos (asignar el
// asesor, enviarla al cliente, la confirmación del cliente): ninguno se pone a mano. Los anteriores llevan ✓, el actual
// va resaltado y debajo se explica qué falta para avanzar (PASOS_SC de la librería: una sola fuente de nombres).
// 'Reiniciar solicitud' solo sale si `puedeReiniciar`; la página confirma con confirmar() y hace el PATCH (R30).
// La página no lo usa en Soporte Técnico (tiene su select) ni en Cancelada (se restaura desde la Papelera).
export function EstadoSolicitudPasos({ solicitud, puedeReiniciar, onReiniciar, reiniciando = false }: {
  solicitud: any;
  puedeReiniciar: boolean;
  onReiniciar: () => void;
  /** true mientras la página guarda el reinicio: el botón queda deshabilitado (sin doble clic). */
  reiniciando?: boolean;
}) {
  // -1: un estado fuera de los pasos (ajeno): se muestra su etiqueta, sin marcar un paso falso.
  const paso = pasoSolicitud(solicitud?.estado);
  return (
    <div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Estado de la solicitud</p>
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        {paso >= 0 ? (
          <>
            <ol className="grid grid-cols-4" aria-label="Pasos de la solicitud">
              {PASOS_SC.map((p, i) => {
                const hecho = i < paso;
                const actual = i === paso;
                return (
                  <li key={p.clave} aria-current={actual ? 'step' : undefined}
                    className="relative flex flex-col items-center gap-1.5 px-1 text-center min-w-0">
                    {/* Tramo desde el paso anterior: verde si este paso ya se alcanzó. */}
                    {i > 0 && (
                      <span aria-hidden="true"
                        className={`absolute top-3.5 right-1/2 w-full h-0.5 ${i <= paso ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                    )}
                    <span className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                      hecho ? 'bg-emerald-500 text-white'
                        : actual ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                        : 'bg-white border-2 border-slate-200 text-slate-300'}`}>
                      {hecho ? '✓' : i + 1}
                    </span>
                    <span className={`text-[11px] font-bold leading-tight break-words ${
                      actual ? 'text-indigo-700' : hecho ? 'text-slate-600' : 'text-slate-400'}`}>
                      {p.label}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              {PASOS_SC[paso].ayuda}
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
