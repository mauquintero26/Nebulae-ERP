'use client';

import { useId, useState, type ReactNode } from 'react';
import { AlertTriangle, Edit2, Send, Trash2 } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { avisoCambiosCliente } from '@/lib/cambios-cliente';
import { TarjetaCambiosCliente } from '../../cotizacion/tarjeta-cambios-cliente';
import { PanelAnularConfirmacion, type AnulacionConfirmacion } from '../../cotizacion/anular-confirmacion';

// B3 T18: las piezas nuevas del detalle de la solicitud (solicitud/[id]/page.tsx solo las cablea, R15). La lógica y los
// textos vienen de lib/cambios-cliente.js y lib/datos-cliente.js (probadas con node); la tarjeta de los cambios y el
// panel de H40 son los de T17.

/** R3 (C19): el aviso bajo la «Nota para el cliente», el mismo de la nota de la cotización (T17). */
export const AYUDA_NOTA_CLIENTE = 'El cliente verá esta nota';

/**
 * H28-cambios punto 8 (C9, R8): «El cliente pidió cambios» (ámbar) o «El cliente dice que ya no la necesita» (rosa) en
 * «Siguiente paso»: el comentario del cliente entre comillas y la fecha (TarjetaCambiosCliente de T17, con
 * avisoCambiosCliente). Para ADMIN o ASESOR (los roles que el servidor acepta en esos tres pedidos):
 * - «Editar productos» (el editor de H25/U13), si los productos se pueden editar;
 * - «Reenviar al cliente» (la ventana del canal de siempre), deshabilitado con el editor de productos abierto;
 * - con «Ya no la necesita», «Cancelar solicitud» (la ventana de cancelar con el motivo prellenado, R8).
 * Sin cambios vigentes no pinta nada.
 */
export function PasoCambiosCliente({ solicitud, puedeGestionar, puedeEditarProductos, editandoProductos, enviando,
  tituloEnviar, pie, onEditarProductos, onReenviar, onCancelar }: {
  solicitud: unknown;
  /** ADMIN o ASESOR (esAdminOAsesor): sin eso, la tarjeta va sin botones. */
  puedeGestionar: boolean;
  puedeEditarProductos: boolean;
  editandoProductos: boolean;
  enviando: boolean;
  /** El porqué de «Reenviar al cliente» deshabilitado (el editor de productos abierto). */
  tituloEnviar?: string;
  /** Lo que va debajo de los botones (el porqué escrito, como en los demás pasos). */
  pie?: ReactNode;
  onEditarProductos: () => void;
  onReenviar: () => void;
  onCancelar: () => void;
}) {
  const aviso = avisoCambiosCliente(solicitud, 'SC');
  if (!aviso) return null;
  return (
    <TarjetaCambiosCliente aviso={aviso} acciones={puedeGestionar ? (
      <>
        {puedeEditarProductos && (
          <Button color="amber" size="lg" icon={Edit2} onClick={onEditarProductos}>Editar productos</Button>
        )}
        <span className="block [&>button]:w-full" title={tituloEnviar}>
          <Button color="indigo" size="lg" icon={Send} loading={enviando} disabled={editandoProductos} onClick={onReenviar}>
            Reenviar al cliente
          </Button>
        </span>
        {aviso.tono === 'rosa' && (
          <Button variant="danger" icon={Trash2} onClick={onCancelar}>Cancelar solicitud</Button>
        )}
        {pie}
      </>
    ) : undefined} />
  );
}

/**
 * R3 (C19, U17-H28 punto 6): la «Nota para el cliente» de la SC fuera de «Editar», con «El cliente verá esta nota». La
 * ven el cliente en su solicitud, su cotización y su pedido; las Notas de la SC siguen internas. Sin nota no pinta nada.
 */
export function NotaParaElCliente({ nota }: { nota: unknown }) {
  if (typeof nota !== 'string' || !nota.trim()) return null;
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nota para el cliente</p>
      <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{nota}</p>
      <p className="text-xs text-slate-500 mt-1.5">{AYUDA_NOTA_CLIENTE}</p>
    </div>
  );
}

/**
 * R3: el campo «Nota para el cliente» de «Editar», debajo de las Notas, con «El cliente verá esta nota» ligado al
 * campo (aria-describedby). Guardarla no anula el enlace ni la confirmación del cliente (el servidor la tiene en
 * `allowed` de update_solicitud).
 */
export function CampoNotaParaElCliente({ valor, onCambio }: { valor: string; onCambio: (valor: string) => void }) {
  const id = useId();
  const ayudaId = `${id}-ayuda`;
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider block">Nota para el cliente</label>
      <textarea id={id} value={valor} onChange={e => onCambio(e.target.value)} rows={3} aria-describedby={ayudaId}
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none" />
      <p id={ayudaId} className="text-xs text-slate-500 mt-1">{AYUDA_NOTA_CLIENTE}</p>
    </div>
  );
}

/**
 * U22-anticipo punto 4 (nota del controlador tras T7): la ventana de H40 cuando «Guardar» de «Editar» responde 409
 * ANULA_CONFIRMACION por cambiar la modalidad de pago (anulacionPorModalidad de lib/datos-cliente.js). Muestra el
 * mensaje del servidor (cada cotización con su anticipo de antes y el nuevo), lo que cambia y la razón obligatoria
 * (PanelAnularConfirmacion de T17, que pasa el foco a la razón). Con la razón, quien la monta repite el MISMO PATCH con
 * anular_confirmacion y motivo_recotizacion. La razón vive aquí mientras la ventana está abierta; `error` es el del
 * reintento, se ve solo aquí dentro y se borra al editar la razón. No se cierra mientras guarda.
 */
export function VentanaAnularPorModalidad({ anulacion, titulo, numero, guardando, error, onLimpiarError,
  onSeguirEditando, onAnular }: {
  anulacion: AnulacionConfirmacion;
  titulo: string;
  numero?: string | null;
  guardando: boolean;
  error?: string;
  onLimpiarError: () => void;
  onSeguirEditando: () => void;
  onAnular: (motivo: string) => void;
}) {
  const [razon, setRazon] = useState('');
  return (
    <Modal title="Se anulará la confirmación del cliente"
      subtitle={numero ? `Cambiaste la modalidad de pago de la solicitud ${numero}` : 'Cambiaste la modalidad de pago de la solicitud'}
      icon={AlertTriangle} color="rose" maxWidth="lg" bloquearCierre={guardando}
      onClose={() => { if (!guardando) onSeguirEditando(); }}>
      <PanelAnularConfirmacion anulacion={anulacion} titulo={titulo} razon={razon} saving={guardando}
        onRazon={valor => { setRazon(valor); onLimpiarError(); }}
        error={error ? <p role="alert" className="text-xs text-red-600 font-bold bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p> : undefined}
        placeholder="Ej: el cliente pidió pagar a crédito" onSeguirEditando={onSeguirEditando} onAnular={onAnular} />
    </Modal>
  );
}
