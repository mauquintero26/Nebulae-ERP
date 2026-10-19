'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { API_URL } from '@/lib/api';
import { DocumentoComercial } from '@/components/documento';
import {
  metaDeLaVista, pedirPublico, tituloDeLaPagina, vistaConDocumento, vistaDeRespuesta, type VistaPublica,
} from '@/lib/confirmacion-publica';
import {
  coloresBotonPrincipal, contactosEmpresa, mensajeWhatsAppDocumento, resumenPagosCliente,
} from '@/lib/documento-comercial';
import { formatoPesos } from '@/lib/pesos';
import { AvisoEnlace, CargandoDocumento } from '@/app/confirmar/[token]/aviso-enlace';

/** Un pago de resumenPagosCliente: el concepto del servidor, 'Transferencia · 3 de octubre de 2026' y el monto. */
type PagoCliente = { concepto: string; metodo: string | null; fecha: string; monto: number; detalle: string };

/**
 * Los pagos del pedido que ve el cliente (U23 punto 9, R24, RP25), bajo los totales de la hoja: lee pago y totales con
 * resumenPagosCliente. Solo la lista de pagos (concepto, medio, fecha y monto): 'Pagado', 'Anticipo pendiente' y
 * 'Saldo por pagar' ya los pinta filasTotales (nota del controlador después de T12), así que aquí no se repiten.
 */
function ResumenPagosCliente({ pago, totales }: { pago: unknown; totales: unknown }) {
  const pagos: PagoCliente[] = resumenPagosCliente(pago, totales).pagos;
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">Pagos registrados</h2>
      {pagos.length === 0 ? (
        <p className="text-sm text-gray-600">Todavía no hay pagos registrados.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
          {pagos.map((p, i) => (
            <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-sm text-gray-900">
              <div className="min-w-0">
                <p className="break-words font-medium">{p.concepto}</p>
                {p.detalle && <p className="break-words text-xs text-gray-600">{p.detalle}</p>}
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{formatoPesos(p.monto)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * El pedido que ve el cliente por su enlace de consulta (B3 T15: U23 puntos 9 y 10; C3, C10, C26, R24, RP27). Solo
 * mira: no hay botones de confirmar ni de cambios.
 * - UNA llamada (POST /pedido-cliente/ver con pedirPublico, sin la sesión del personal ni Referer): {status, empresa,
 *   data: documento, cot_numero}. Verlo no gasta el enlace.
 * - Con datos: DocumentoComercial 'acento' (PEDIDO DE VENTA) con 'Según cotización COT-…' y la entrega estimada, los
 *   totales con lo pagado y lo que falta (filasTotales), los pagos (ResumenPagosCliente) y 'Escríbenos por WhatsApp' si
 *   la empresa tiene WhatsApp; 'Descargar o imprimir' lo pone el documento.
 * - Si el enlace no sirve: la pantalla genérica de enlace no válido (AvisoEnlace) con el contacto de la empresa; sin
 *   conexión, con 'Reintentar'.
 */
export default function PedidoClientePage() {
  const params = useParams();
  const token = String(params.token || '');
  const [vista, setVista] = useState<VistaPublica | null>(null);
  // Cada 'Reintentar' vuelve a pedir el pedido.
  const [intento, setIntento] = useState(0);
  // T15 r1 (accesibilidad): tras 'Reintentar', la vista nueva toma el foco (el h1 del aviso o la página).
  const [enfocar, setEnfocar] = useState(false);
  const principal = useRef<HTMLElement>(null);
  const conHoja = vista !== null && vista.estado_enlace === 'consulta' && vistaConDocumento(vista);

  useEffect(() => {
    // Round 7: el token va en el cuerpo JSON, nunca en la URL de la API.
    let vigente = true;
    pedirPublico(API_URL, '/pedido-cliente/ver', { token }).then((r) => {
      if (vigente) setVista(vistaDeRespuesta(r));
    });
    return () => {
      vigente = false;
    };
  }, [token, intento]);

  useEffect(() => {
    if (vista) document.title = tituloDeLaPagina(vista, 'Tu pedido');
  }, [vista]);

  useEffect(() => {
    if (enfocar && conHoja) principal.current?.focus();
  }, [enfocar, conHoja, vista]);

  let contenido;
  if (!vista) {
    contenido = <CargandoDocumento />;
  } else if (conHoja) {
    const doc = vista.documento;
    const whatsapp = contactosEmpresa(vista.empresa, mensajeWhatsAppDocumento('PVEN', doc.numero))
      .find((c) => c.tipo === 'whatsapp');
    const boton = coloresBotonPrincipal(vista.empresa, 'acento');
    contenido = (
      <DocumentoComercial
        documento={doc}
        marca={vista.empresa}
        apiUrl={API_URL}
        variante="acento"
        metaDerecha={metaDeLaVista(vista)}
        extraTotales={<ResumenPagosCliente pago={doc.pago} totales={doc.totales} />}
        acciones={whatsapp ? (
          <div className="flex @min-[40rem]:justify-end">
            <a
              href={whatsapp.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-bold @min-[40rem]:flex-none"
              style={{ background: boton.fondo, color: boton.texto }}
            >
              <MessageCircle size={16} aria-hidden="true" />
              Escríbenos por WhatsApp
            </a>
          </div>
        ) : undefined}
      />
    );
  } else {
    contenido = (
      <AvisoEnlace
        vista={vista}
        apiUrl={API_URL}
        onReintentar={() => {
          setVista(null);
          setEnfocar(true);
          setIntento((n) => n + 1);
        }}
        enfocar={enfocar}
      />
    );
  }

  return (
    <main
      ref={principal}
      tabIndex={-1}
      className="min-h-screen bg-gray-100 px-4 py-6 text-gray-900 outline-none print:bg-white print:p-0"
    >
      {contenido}
    </main>
  );
}
