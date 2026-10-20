'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAvisos } from '@/components/ui';
import { textoDeError, recargarTrasError } from '@/lib/avisos';
import { textoEnlaceVigente, TEXTO_ENLACE_PEDIDO_VENCIDO } from '@/lib/documento-comercial';
import {
  abreWhatsAppLocal, botonEnvioPedido, envioIncierto, pedidoSeEnvio, avisoEnvioIncierto,
} from '@/lib/envio-whatsapp';
import { filaProductoPedido, textosTarjetaPedido, notaProductosCancelados, ETIQUETA_SIN_TARIFA } from '@/lib/iva';
import { formatoPesos } from '@/lib/pesos';
import { waUrl, abrirWhatsApp } from '@/lib/whatsapp';
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
 *   telefono_whatsapp (el e164, RP19) con el texto_manual del servidor o el de siempre (abrirWhatsApp: sin
 *   window.opener). Con la respuesta cierra la ventana del canal, deja `resultado` para la ventana del enlace y recarga
 *   el pedido sin esperar (r1: la ventana no queda en «enviando» durante la recarga).
 * - Los errores van dentro de la ventana del canal, que sigue abierta (H49); se borran al elegir otro canal.
 *   - Un 400 o 409 recarga; si el pedido vuelve CANCELADO (el 409 de cancelado), la ventana se cierra y el error queda
 *     en un aviso.
 *   - r1: un resultado incierto (envioIncierto: un 5xx o un error sin status, que pueden llegar después del commit del
 *     servidor) recarga y compara enlace_cliente.enviado_at con el de antes del POST (pedidoSeEnvio). Si cambió, el
 *     pedido sí se envió: la ventana se cierra y se avisa con avisoEnvioIncierto («El pedido sí se envió; revisa la
 *     Actividad antes de reenviar», o, r2, que el WhatsApp manual no se abrió). Si no, queda el error. r2: la ventana
 *     sigue en «enviando» hasta que llega la recarga, y el error no se ve antes de la comparación.
 */
export function useEnvioAlCliente(pedido: PedidoBloque3 | null,
  recargar: (opts?: { silencioso?: boolean }) => Promise<unknown>) {
  const { avisar, avisarError } = useAvisos();
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
    cerrarVentana();
  }

  function elegirCanal(c: CanalEnvio) {
    setCanal(c);
    setError('');
  }

  function cerrarVentana() {
    setAbierto(false);
    setCanal(null);
    setError('');
  }

  async function enviarAlCliente() {
    if (!pedido?.id || !canal || enviando) return;
    // r1: para saber, si el resultado queda incierto, si el pedido sí se envió.
    const enlaceAntes = pedido.enlace_cliente as { enviado_at?: unknown } | null | undefined;
    const enviadoAntes = enlaceAntes?.enviado_at ?? null;
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
        abrirWhatsApp(whatsappUrl);
      }
      cerrarVentana();
      if (link) setResultado({ link, correo: d?.correo ?? null, canal, whatsappUrl, envioWhatsapp: wa, vence: d?.vence ?? null });
      void recargar({ silencioso: true });
    } catch (err) {
      if (envioIncierto(err)) {
        // r2: espera la recarga ANTES de soltar `enviando` y de mostrar el error: si el pedido sí se envió, la ventana no
        // invita a reenviar.
        const fresco = await recargar({ silencioso: true });
        if (pedidoSeEnvio(enviadoAntes, fresco)) {
          cerrarVentana();
          avisar(avisoEnvioIncierto(canal, estadoWhatsApp), { tono: 'info' });
        } else {
          setError(textoDeError(err, PREFIJO_ERROR));
        }
      } else {
        setError(textoDeError(err, PREFIJO_ERROR));
        if (recargarTrasError(err)) {
          void recargar({ silencioso: true }).then((fresco) => {
            if ((fresco as PedidoBloque3 | null | undefined)?.estado !== 'CANCELADO') return;
            cerrarVentana();
            avisarError(err, PREFIJO_ERROR);
          });
        }
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
 * IVA punto 12: los productos del pedido y, debajo, los totales de la COT (TotalesIvaCotizacion: Subtotal, Descuento,
 * IVA por tarifa) y TOTAL, de la cabecera (nunca recalculados, C2).
 * - Cada línea sale de filaProductoPedido: el nombre, la cantidad, el precio y la etiqueta de IVA de su documento del
 *   cliente (la etiqueta solo si el pedido tiene el IVA discriminado). El total de la línea va CON IVA (el documento del
 *   cliente lo pone sin IVA, C4): por eso la columna dice «Total con IVA» (ruling r1). Un pedido viejo dice 'IVA no
 *   discriminado' y su columna, «Total».
 * - r1 (Important): con el @container de la página (H37), desde @xl va la tabla PRODUCTO / CANT. / P. UNIT. SIN IVA /
 *   IVA / TOTAL CON IVA; por debajo (a 1024 px la columna mide unos 390 px y la tabla no cabe), cada línea es una tarjeta
 *   (textosTarjetaPedido, el lenguaje de PrecioLineaIva de la COT) con el total con IVA a la derecha.
 * - r1: si se cancelaron productos (LINEA_CANCELADA en la Actividad), la misma nota que ve el cliente.
 */
export function TablaProductosPedido({ pedido }: { pedido: PedidoBloque3 | null }) {
  const productos = Array.isArray(pedido?.productos) ? pedido.productos : [];
  const discriminado = pedido?.iva_discriminado === true;
  const filas = productos.map((p) => filaProductoPedido(p, discriminado));
  const notaCancelados = notaProductosCancelados(pedido?.actividades);
  return (
    <>
      <ul className="@xl:hidden space-y-3">
        {filas.length === 0 && (
          <li className="bg-white border border-slate-200 rounded-2xl px-4 py-6 text-center text-sm text-slate-500 italic">Sin productos registrados.</li>
        )}
        {filas.map((f, idx) => {
          const t = textosTarjetaPedido(f);
          return (
            <li key={idx} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-slate-800 text-sm break-words">{f.producto}</p>
                <p className="text-xs text-slate-500">{t.precio}</p>
                {t.iva && <p className={`text-xs ${f.iva ? 'font-semibold text-slate-600' : 'text-slate-500'}`}>{t.iva}</p>}
              </div>
              <p className="shrink-0 text-right">
                <span className="block font-black text-slate-900">{formatoPesos(f.total)}</span>
                {discriminado && <span className="block text-[11px] text-slate-500">con IVA</span>}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="hidden @xl:block bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th scope="col" className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Producto</th>
              <th scope="col" className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-20 text-center">Cant.</th>
              <th scope="col" className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-36 text-right">P. unit. sin IVA</th>
              <th scope="col" className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-32">IVA</th>
              <th scope="col" className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-36 text-right">{discriminado ? 'Total con IVA' : 'Total'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500 italic">Sin productos registrados.</td></tr>
            )}
            {filas.map((f, idx) => (
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
                    <span className="text-xs text-slate-500">{ETIQUETA_SIN_TARIFA}</span>
                  ) : (
                    <><span aria-hidden="true" className="text-slate-300">—</span><span className="sr-only">Sin IVA</span></>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <span className="block font-black text-slate-800">{formatoPesos(f.total)}</span>
                  {f.iva?.descuento && <span className="block text-xs text-slate-500">{f.iva.descuento}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notaCancelados && (
        <p className="mt-3 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{notaCancelados}</p>
      )}
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
