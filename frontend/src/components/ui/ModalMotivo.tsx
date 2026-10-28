'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { MINIMO_MOTIVO, motivoValido } from '@/lib/kanban';
import { textoDeError } from '@/lib/avisos';

/**
 * La ventana del motivo para cancelar o rechazar (Bloque 4, T4A; KANBAN-base punto 4): la usan los tableros y las
 * acciones de fila. Va sobre Modal con capa 'encima' (z-[60], sobre los modales de la página) y en rojo: título,
 * mensaje opcional, la lista de efectos y el campo 'Motivo (mínimo 5 caracteres)'.
 *  - El botón de peligro solo se activa con MINIMO_MOTIVO caracteres o más, sin contar los espacios del borde
 *    (motivoValido de lib/kanban.js).
 *  - onConfirmar recibe el motivo sin los espacios del borde y es async. Si termina bien, la ventana se cierra
 *    (onCerrar). Si falla, el error queda en una caja rose dentro de la ventana y lo escrito no se borra (regla del
 *    Bloque 2). Mientras guarda no se puede cerrar ni volver a confirmar. Después de un error el campo vuelve a estar
 *    habilitado y con el foco (r1), para corregir y reintentar.
 */
export function ModalMotivo({
  titulo, mensaje, efectos, textoConfirmar = 'Confirmar', textoCancelar = 'Volver', placeholder, onConfirmar, onCerrar,
}: {
  titulo: string;
  mensaje?: React.ReactNode;
  efectos?: string[];
  textoConfirmar?: string;
  textoCancelar?: string;
  placeholder?: string;
  onConfirmar: (motivo: string) => Promise<unknown> | void;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Cuántas veces falló: el foco vuelve al campo después de cada error, aunque el mensaje sea el mismo. */
  const [fallos, setFallos] = useState(0);
  const campo = useRef<HTMLTextAreaElement>(null);
  const idCampo = useId();
  const idMensaje = useId();
  const idError = useId();
  const valido = motivoValido(motivo);

  // Ya sin guardar (el campo otra vez habilitado): el foco vuelve al motivo, con lo escrito intacto.
  useEffect(() => {
    if (fallos > 0 && !guardando) campo.current?.focus();
  }, [fallos, guardando]);

  const cerrar = () => {
    if (!guardando) onCerrar();
  };

  const confirmar = async () => {
    if (!valido || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await onConfirmar(motivo.trim());
      onCerrar();
    } catch (err) {
      setError(textoDeError(err));
      setFallos((n) => n + 1);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      capa="encima"
      role="alertdialog"
      color="red"
      icon={AlertTriangle}
      maxWidth="md"
      title={titulo}
      describedBy={mensaje ? idMensaje : undefined}
      onClose={cerrar}
      bloquearCierre={guardando}
      footer={(
        <>
          <Button variant="secondary" disabled={guardando} onClick={cerrar}>{textoCancelar}</Button>
          <Button variant="danger" loading={guardando} disabled={!valido} onClick={confirmar}>{textoConfirmar}</Button>
        </>
      )}
    >
      {mensaje && <div id={idMensaje} className="text-sm text-slate-700">{mensaje}</div>}
      {efectos && efectos.length > 0 && (
        <ul className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 list-disc list-inside">
          {efectos.map((efecto, i) => <li key={i}>{efecto}</li>)}
        </ul>
      )}
      <div>
        <label htmlFor={idCampo} className="block text-xs font-bold text-slate-600 mb-1">
          {`Motivo (mínimo ${MINIMO_MOTIVO} caracteres)`}
        </label>
        <textarea
          ref={campo}
          id={idCampo}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          autoFocus
          disabled={guardando}
          placeholder={placeholder}
          aria-describedby={error ? idError : undefined}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 resize-none disabled:bg-slate-50"
        />
      </div>
      {error && (
        <p id={idError} role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 whitespace-pre-line">
          {error}
        </p>
      )}
    </Modal>
  );
}
