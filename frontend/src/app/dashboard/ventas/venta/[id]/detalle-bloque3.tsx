'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAvisos } from '@/components/ui';
import { textoDeError, recargarTrasError } from '@/lib/avisos';
import { botonEnvioPedido, textoEnlaceVigente, TEXTO_ENLACE_PEDIDO_VENCIDO } from '@/lib/documento-comercial';
import { abreWhatsAppLocal } from '@/lib/envio-whatsapp';
import { filaProductoPedido, ETIQUETA_SIN_TARIFA } from '@/lib/iva';
import { formatoPesos } from '@/lib/pesos';
import { waUrl } from '@/lib/whatsapp';
import { getUsuarioActual } from '../../flujo';
import { useEstadoEnvioWhatsApp } from '../../cotizacion/estado-envio-whatsapp';
import { TotalesIvaCotizacion } from '../../cotizacion/[id]/detalle-bloque3';

// B3 T19: las piezas nuevas del detalle del pedido de venta (venta/[id]/page.tsx solo las cablea, R15). Toda la lógica
// y los textos vienen de lib/documento-comercial.js, lib/iva.js y lib/envio-whatsapp.js (probadas con node).

type Monto = number | string | null | undefined;
type CanalEnvio = 'WhatsApp' | 'Email' | 'Otro';
/** Lo que leen estas piezas del GET /ventas/pedidos/{id} (_ven_dict y get_pedido, con el IVA de T4 y el enlace de T7). */
export type PedidoBloque3 = {
  id?: number | string | null; numero?: string | null; estado?: string | null; productos?: unknown[] | null;
  subtotal_cop?: Monto; descuento_pct?: Monto; descuento_cop?: Monto; total_cop?: Monto; iva_discriminado?: boolean;
  telefono_whatsapp?: string | null; enlace_cliente?: unknown; [clave: string]: unknown;
};
/** Lo que abre la ventana del enlace (EnlaceConfirmacionModal con tipo='consulta') después de enviar. */
export type ResultadoEnvioPedido = {
  link: string;
  correo: { enviado: boolean; destino?: string | null; motivo?: string | null; mensaje?: string } | null;
  canal: CanalEnvio;
  /** El wa.me que se abrió en este computador (automático apagado), para el botón de volver a abrirlo. */
  whatsappUrl: string | null;
  /** El `whatsapp` de la respuesta (el resultado del envío automático; la envioWhatsapp de la ventana, RP23). */
  envioWhatsapp: unknown;
  /** El último día en que sirve el enlace ('AAAA-MM-DD', R6: 30 días). */
  vence: string | null;
};

const PREFIJO_ERROR = 'No se pudo enviar el pedido al cliente';

/**
 * U23 punto 7 y U16-envio (RP15, RP19, RP23, H49): «Enviar al cliente» / «Reenviar al cliente» del pedido.
 * - boton: botonEnvioPedido (null en un pedido CANCELADO, para un rol que no es ADMIN ni ASESOR o sin productos ni
 *   total: lo que el servidor rechazaría).
 * - El ChannelModal (que monta la página) consulta el estado del WhatsApp automático mientras está abierto
 *   (useEstadoEnvioWhatsApp: estadoWhatsApp, la envioWhatsApp con A mayúscula).
 * - enviarAlCliente: POST /ventas/pedidos/{id}/enviar-al-cliente con solo el canal (el autor lo pone el servidor,
 *   RP15). wa.me se abre solo si el canal es WhatsApp y el automático no vino o está apagado (abreWhatsAppLocal), al
 *   telefono_whatsapp (el e164, RP19) con el texto_manual del servidor o el de siempre. Después recarga el pedido (la
 *   línea «Enviado… · sirve hasta…» y la Actividad) y deja `resultado` para la ventana del enlace.
 * - Los errores van dentro de la ventana del canal, que sigue abierta (H49); se borran al elegir otro canal. Si la
 *   recarga trae el pedido CANCELADO (el 409 de cancelado), la ventana se cierra y el error queda en un aviso.
 */
export function useEnvioAlCliente(pedido: PedidoBloque3 | null,
  recargar: (opts?: { silencioso?: boolean }) => Promise<unknown>) {
  const { avisarError } = useAvisos();
  const [abierto, setAbierto] = useState(false);
  const [canal, setCanal] = useState<CanalEnvio | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<ResultadoEnvioPedido | null>(null);
  const estadoWhatsApp = useEstadoEnvioWhatsApp(abierto);
  const boton = botonEnvioPedido(pedido, getUsuarioActual().role);

  function abrir() {
    setCanal(null);
    setError('');
    setAbierto(true);
  }

  function cerrar() {
    // Mientras envía no se cierra: el resultado siempre llega a una ventana abierta.
    if (enviando) return;
    setAbierto(false);
    setCanal(null);
    setError('');
  }

  function elegirCanal(c: CanalEnvio) {
    setCanal(c);
    setError('');
  }

  async function enviarAlCliente() {
    if (!pedido?.id || !canal || enviando) return;
    setEnviando(true);
    setError('');
    try {
      const d = await apiFetch(`/ventas/pedidos/${pedido.id}/enviar-al-cliente`, {
        method: 'POST',
        body: JSON.stringify({ canal }),
      });
      const link = typeof d?.link === 'string' ? d.link : '';
      const wa = d?.whatsapp ?? null;
      let whatsappUrl: string | null = null;
      if (abreWhatsAppLocal(canal, wa)) {
        const mensaje = link
          ? `Hola, aquí está la confirmación de tu pedido ${pedido.numero || ''}: ${link}`
          : `Hola, aquí está la confirmación de tu pedido ${pedido.numero || ''}`;
        whatsappUrl = waUrl(pedido.telefono_whatsapp, wa?.texto_manual || mensaje);
        if (whatsappUrl) window.open(whatsappUrl, '_blank');
      }
      await recargar({ silencioso: true });
      setAbierto(false);
      setCanal(null);
      if (link) setResultado({ link, correo: d?.correo ?? null, canal, whatsappUrl, envioWhatsapp: wa, vence: d?.vence ?? null });
    } catch (err) {
      setError(textoDeError(err, PREFIJO_ERROR));
      if (recargarTrasError(err)) {
        void recargar({ silencioso: true }).then((fresco) => {
          if ((fresco as PedidoBloque3 | null | undefined)?.estado !== 'CANCELADO') return;
          setAbierto(false);
          setCanal(null);
          setError('');
          avisarError(err, PREFIJO_ERROR);
        });
      }
    }
    setEnviando(false);
  }

  return {
    boton, abierto: abierto && boton !== null, canal, enviando, error, estadoWhatsApp, resultado,
    abrir, cerrar, elegirCanal, enviarAlCliente, cerrarResultado: () => setResultado(null),
  };
}

/**
 * U23 punto 7: bajo el título del Resumen Financiero, 'Enviado al cliente el 3 de octubre de 2026 · el enlace sirve
 * hasta el 2 de noviembre de 2026' o, en ámbar, 'El enlace del cliente venció: reenvíaselo' (textoEnlaceVigente, con el
 * estado del pedido: nada en un pedido CANCELADO ni si nunca se envió).
 */
export function LineaEnlaceCliente({ enlace, estado }: { enlace: unknown; estado: string | null | undefined }) {
  const texto = textoEnlaceVigente(enlace, estado ?? null);
  if (!texto) return null;
  const vencido = texto === TEXTO_ENLACE_PEDIDO_VENCIDO;
  return (
    <p className={`-mt-2 mb-4 flex items-start gap-1.5 text-sm ${vencido ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>
      <Send size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{texto}</span>
    </p>
  );
}

/**
 * IVA punto 12: la tabla Productos del pedido, PRODUCTO / CANT. / P. UNIT. SIN IVA / IVA / TOTAL, con lo mismo que su
 * documento del cliente (filaProductoPedido: la etiqueta de la tarifa solo si el pedido tiene el IVA discriminado), y
 * debajo los totales de la COT (TotalesIvaCotizacion: Subtotal, Descuento, IVA por tarifa) y TOTAL, de la cabecera
 * (nunca recalculados, C2). Un pedido viejo dice 'IVA no discriminado'. Con la columna angosta, la tabla se desplaza
 * dentro de su tarjeta (H37).
 */
export function TablaProductosPedido({ pedido }: { pedido: PedidoBloque3 | null }) {
  const productos = Array.isArray(pedido?.productos) ? pedido.productos : [];
  const discriminado = pedido?.iva_discriminado === true;
  return (
    <>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Producto</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-20 text-center">Cant.</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-36 text-right">P. unit. sin IVA</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-32">IVA</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-36 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {productos.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400 italic">Sin productos registrados.</td></tr>
            )}
            {productos.map((p, idx) => {
              const f = filaProductoPedido(p, discriminado);
              return (
                <tr key={idx} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-3 font-bold text-slate-800 text-sm break-words min-w-40">{f.producto}</td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-slate-700">{f.cantidad}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-slate-700 whitespace-nowrap">{formatoPesos(f.unitario)}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {f.iva ? (
                      <>
                        <span className="block font-bold text-slate-700">{f.iva.etiqueta}</span>
                        <span className="block text-xs text-slate-500">{formatoPesos(f.iva.valor)}</span>
                      </>
                    ) : f.sinDiscriminar ? (
                      <span className="text-xs text-slate-400">{ETIQUETA_SIN_TARIFA}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className="block font-black text-slate-800">{formatoPesos(f.total)}</span>
                    {f.iva?.descuento && <span className="block text-xs text-slate-500">{f.iva.descuento}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(productos.length > 0 || Number(pedido?.total_cop) > 0) && (
        <div className="flex justify-end mt-6">
          <div className="w-full @md:w-80 bg-slate-50 p-5 rounded-2xl border border-slate-200">
            <TotalesIvaCotizacion cotizacion={pedido} />
            <div className="h-px w-full bg-slate-200 mb-4" />
            <div className="flex justify-between items-center gap-2">
              <span className="text-base font-black text-slate-800">TOTAL</span>
              <span className="text-xl font-black text-indigo-600 shrink-0">{formatoPesos(pedido?.total_cop)}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
