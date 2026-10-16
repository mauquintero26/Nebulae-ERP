'use client';
import { AlertTriangle, FileText } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import {
  MOTIVO_SIN_CONFIRMACION_MIN, MOTIVO_SIN_CONFIRMACION_MAX, motivoLimpio, errorMotivoSinConfirmacion,
} from '@/lib/estados-solicitud';
import { largoTexto } from '@/lib/chatter';

/**
 * La ventana del motivo de una cotización sin la confirmación del cliente (U11 y S5). Una sola para los dos sitios
 * que la piden:
 * - el detalle de la SC, «Cotizar sin esperar confirmación» (POST /cotizar-sin-confirmacion con {motivo});
 * - B2.1 D6: el detalle de la COT, cuando retomarla responde 409 MOTIVO_NUEVO (la solicitud se canceló y se restauró
 *   después de crearla) y el PATCH se reintenta con motivo_sin_confirmacion.
 * Lo que cuenta el servidor para los límites (T11 calidad, D1): el motivo limpio (sin invisibles, espacios en uno, sin
 * bordes) en puntos de código; errorMotivoSinConfirmacion es su 422 (largo y letras o dígitos) y bloquea el botón. El
 * error del servidor (`error`) se muestra aquí dentro. Mientras guarda no se cierra (ni la X, ni el botón de cancelar).
 */
export function VentanaMotivoSinConfirmacion({
  titulo, aviso, detalle, motivo, onMotivo, error, guardando, textoCancelar, textoConfirmar, placeholder, idCampo,
  onCerrar, onConfirmar,
}: {
  titulo: string;
  /** La línea en negrita del recuadro ámbar. */
  aviso: string;
  /** La explicación de debajo. */
  detalle: string;
  motivo: string;
  onMotivo: (valor: string) => void;
  /** El error del servidor ('' sin error). */
  error: string;
  guardando: boolean;
  textoCancelar: string;
  textoConfirmar: string;
  placeholder: string;
  /** id del campo (enlaza la etiqueta). */
  idCampo: string;
  onCerrar: () => void;
  onConfirmar: () => void;
}) {
  const largo = largoTexto(motivoLimpio(motivo));
  const errorMotivo = errorMotivoSinConfirmacion(motivo);
  return (
    <Modal title={titulo} icon={AlertTriangle} color="amber" maxWidth="md"
      onClose={() => { if (!guardando) onCerrar(); }}
      bloquearCierre={guardando}
      footer={(
        <>
          <Button variant="secondary" disabled={guardando} onClick={onCerrar}>{textoCancelar}</Button>
          <Button color="amber" icon={FileText} loading={guardando} disabled={!!errorMotivo} onClick={onConfirmar}>{textoConfirmar}</Button>
        </>
      )}>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
        <p className="text-sm font-bold text-amber-900">{aviso}</p>
        <p className="text-xs text-amber-800 mt-1 leading-relaxed">{detalle}</p>
      </div>
      <div>
        <label htmlFor={idCampo} className="text-xs font-black text-slate-500 uppercase mb-2 block">Motivo (nota interna) *</label>
        <textarea
          id={idCampo}
          value={motivo}
          onChange={e => onMotivo(e.target.value)}
          readOnly={guardando}
          rows={3}
          // T11 calidad (D2): sin maxLength (cuenta UTF-16 crudo, con los invisibles): el botón se bloquea con el largo
          // limpio por encima del máximo.
          placeholder={placeholder}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-200 outline-none"
          autoFocus
        />
        <div className="flex items-start justify-between gap-3 mt-1 text-xs">
          <span className={errorMotivo ? 'text-amber-700' : 'text-slate-500'}>
            {largo < MOTIVO_SIN_CONFIRMACION_MIN
              ? `Mínimo ${MOTIVO_SIN_CONFIRMACION_MIN} caracteres (llevas ${largo}).`
              : errorMotivo ?? 'Lo ve tu equipo en la Actividad; el cliente no lo recibe.'}
          </span>
          <span className={`tabular-nums shrink-0 ${largo > MOTIVO_SIN_CONFIRMACION_MAX ? 'text-rose-700 font-bold' : 'text-slate-400'}`}>{largo}/{MOTIVO_SIN_CONFIRMACION_MAX}</span>
        </div>
        {error && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mt-3">{error}</p>}
      </div>
    </Modal>
  );
}
