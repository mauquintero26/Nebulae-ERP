'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Globe, Mail, MessageCircle, Phone, Printer } from 'lucide-react';
import { formatoPesos } from '@/lib/pesos';
import { formatoPct } from '@/lib/dinero-ventas';
import { fechaLarga } from '@/lib/fechas-colombia';
import { normalizarMarca } from '@/lib/marca-empresa';
import {
  TIPOS_DOCUMENTO, colorSobreBlanco, colorTextoSobre, contactosEmpresa, filasTotales, formaDePagoDocumento,
  formatoCantidad, mensajeWhatsAppDocumento, normalizarDocumento, textoEntregaEstimada, tituloDePestana,
  type DocumentoCliente, type FilaTotal, type LineaDocumento,
} from '@/lib/documento-comercial';
import { LogoMarca } from './EncabezadoMarca';

/** El sello que se imprime junto al título ('CONFIRMADA', 'VENCIDA'…). */
export type SelloDocumento = { texto: string; tono?: 'ok' | 'alerta' | 'info' | 'gris' };
/** Un dato más del encabezado ('Válida hasta', 'Según cotización'…). */
export type MetaDocumento = { etiqueta: string; valor: ReactNode };

export type DocumentoComercialProps = {
  /** El documento de backend/app/core/documento_cliente.py (C2, R24), tal cual llega. */
  documento: unknown;
  /** La marca (perfil_publico, normalizarMarca o la respuesta pública). */
  marca: unknown;
  /** La URL del API (API_URL de lib/api.ts), para el logo. */
  apiUrl: string;
  /** 'degradado' (SC) o 'acento' (COT y PVEN); por defecto, la del tipo del documento. */
  variante?: 'degradado' | 'acento';
  /** Los botones de la página (Confirmar, Pedir cambios…): fijos abajo en el celular y ocultos al imprimir. */
  acciones?: ReactNode;
  sello?: SelloDocumento | null;
  /** Un aviso encima de la hoja (oculto al imprimir). */
  aviso?: ReactNode;
  mostrarDescargar?: boolean;
  /** Pone el título de la pestaña: 'Cotización COT-… · Empresa'. */
  fijarTitulo?: boolean;
  metaDerecha?: MetaDocumento[];
  /** Lo que va bajo los totales (ResumenPagosCliente del pedido, C3). */
  extraTotales?: ReactNode;
  /**
   * B3 T15: el nivel del título del documento ('SOLICITUD', 'COTIZACIÓN'…): 1 (por defecto) cuando la hoja es lo
   * principal de la página; 2 debajo de otro h1 (el aviso de la página pública, la vista previa de Configuración). Las
   * secciones de la hoja quedan un nivel más abajo.
   */
  nivelTitulo?: 1 | 2;
};

const COLOR_SELLO = { ok: '#15803D', alerta: '#B45309', info: '#1D4ED8', gris: '#4B5563' } as const;
const ICONOS_CONTACTO = { telefono: Phone, whatsapp: MessageCircle, correo: Mail, web: Globe } as const;

// Impresión: márgenes sin tamaño fijo (Carta o A4), los colores de la marca y la tabla sin partir filas, con el
// encabezado repetido en cada hoja.
const ESTILOS_IMPRESION = `
@page { margin: 12mm; }
@media print {
  .documento-comercial, .documento-comercial * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .documento-comercial { box-shadow: none !important; }
  .documento-comercial tr { break-inside: avoid; }
  .documento-comercial thead { display: table-header-group; }
}
`;

const pesosO = (v: number | null) => (v === null ? '' : formatoPesos(v));

function Sello({ sello }: { sello: SelloDocumento }) {
  const color = COLOR_SELLO[sello.tono ?? 'info'];
  return (
    <span
      className="inline-block -rotate-3 rounded-md border-2 bg-white px-3 py-1 text-sm font-extrabold uppercase tracking-wider"
      style={{ color, borderColor: color }}
    >
      {sello.texto}
    </span>
  );
}

function ChipIva({ linea }: { linea: LineaDocumento }) {
  if (linea.iva_pct === null) return null;
  return (
    <span className="ml-2 inline-block rounded-full border border-gray-300 px-2 py-0.5 align-middle text-[11px] font-medium text-gray-600">
      {linea.iva_etiqueta ?? `IVA ${formatoPct(linea.iva_pct)}`}
    </span>
  );
}

/** La tabla (escritorio e impresión) y las tarjetas (celular) de las líneas. */
function Lineas({ doc, variante }: { doc: DocumentoCliente; variante: 'degradado' | 'acento' }) {
  if (doc.lineas.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-gray-500">Este documento no tiene productos.</p>;
  }
  const precios = doc.con_precios;
  const fila = variante === 'degradado' ? 'odd:bg-white even:bg-gray-50' : 'border-b border-gray-200';
  return (
    <>
      <table className="hidden w-full border-collapse text-sm @min-[40rem]:table print:table">
        <thead>
          <tr className="border-b-2 border-gray-300 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
            {precios ? (
              <>
                <th scope="col" className="w-20 px-3 py-2 text-center">Cant.</th>
                <th scope="col" className="px-3 py-2">Descripción</th>
                <th scope="col" className="w-36 px-3 py-2 text-right">Precio</th>
                <th scope="col" className="w-36 px-3 py-2 text-right">Total</th>
              </>
            ) : (
              <>
                <th scope="col" className="w-16 px-3 py-2 text-center">No.</th>
                <th scope="col" className="px-3 py-2">Descripción del producto</th>
                <th scope="col" className="w-28 px-3 py-2 text-center">Cantidad</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {doc.lineas.map((l, i) => (
            <tr key={`${l.n}-${i}`} className={`${fila} align-top text-gray-900`}>
              <td className="px-3 py-2 text-center tabular-nums">{precios ? formatoCantidad(l.cantidad) : l.n}</td>
              <td className="px-3 py-2 break-words">
                {l.descripcion}
                <ChipIva linea={l} />
              </td>
              {precios ? (
                <>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {pesosO(l.precio_unitario)}
                    {l.anticipo !== null && (
                      <span className="block text-[11px] text-gray-500">Anticipo: {formatoPesos(l.anticipo)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{pesosO(l.total_linea)}</td>
                </>
              ) : (
                <td className="px-3 py-2 text-center tabular-nums">{formatoCantidad(l.cantidad)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-gray-200 @min-[40rem]:hidden print:hidden">
        {doc.lineas.map((l, i) => (
          <li key={`${l.n}-${i}`} className="flex items-start justify-between gap-3 px-4 py-3 text-sm text-gray-900">
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">
                {!precios && <span className="mr-1 text-gray-500">{l.n}.</span>}
                {l.descripcion}
                <ChipIva linea={l} />
              </p>
              {precios && (
                <p className="mt-0.5 text-gray-600 tabular-nums">
                  {formatoCantidad(l.cantidad)} × {pesosO(l.precio_unitario)}
                </p>
              )}
              {l.anticipo !== null && (
                <p className="text-[11px] text-gray-500">Anticipo: {formatoPesos(l.anticipo)}</p>
              )}
            </div>
            <p className="shrink-0 text-right font-semibold tabular-nums">
              {precios ? pesosO(l.total_linea) : `× ${formatoCantidad(l.cantidad)}`}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function Totales({ filas, variante }: { filas: FilaTotal[]; variante: 'degradado' | 'acento' }) {
  if (filas.length === 0) return null;
  const bloqueTotal: CSSProperties = variante === 'degradado'
    ? { backgroundImage: 'linear-gradient(90deg, var(--doc-principal), var(--doc-secundario))', color: 'var(--doc-sobre-franja)' }
    : { backgroundColor: 'var(--doc-acento)', color: 'var(--doc-sobre-acento)' };
  return (
    <dl className="space-y-1 text-sm text-gray-900">
      {filas.map((f) => {
        if (f.estilo === 'total') {
          return (
            <div key={f.clave} className="flex items-center justify-between gap-4 rounded-md px-3 py-2 text-base font-bold" style={bloqueTotal}>
              <dt>{f.etiqueta}</dt>
              <dd className="tabular-nums">{formatoPesos(f.valor)}</dd>
            </div>
          );
        }
        const clase = f.estilo === 'ambar' ? 'rounded-md bg-amber-50 font-semibold text-amber-800'
          : f.estilo === 'fuerte' ? 'font-semibold' : '';
        return (
          <div key={f.clave} className={`flex items-baseline justify-between gap-4 px-3 py-1 ${clase}`}>
            <dt className="break-words">{f.etiqueta}</dt>
            <dd className="shrink-0 tabular-nums">{formatoPesos(f.valor)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function Seccion({ titulo, nivel = 2, children }: { titulo: string; nivel?: 2 | 3; children: ReactNode }) {
  const Encabezado = nivel === 3 ? 'h3' : 'h2';
  return (
    <section className="space-y-1">
      <Encabezado className="text-xs font-bold uppercase tracking-wide text-gray-500">{titulo}</Encabezado>
      {children}
    </section>
  );
}

/**
 * El documento que ve el cliente, como una factura (Bloque 3, T12: PLANTILLA punto 6, C3): la ÚNICA pieza que pinta
 * la solicitud, la cotización y el pedido. Variante 'degradado' (SC, la referencia morado -> rojo) o 'acento' (COT y
 * PVEN, hoja blanca con acento). No recalcula nada: los números vienen del servidor (normalizarDocumento solo
 * completa total_linea si falta) y los textos salen de lib/documento-comercial.js.
 * - Colores de la marca como variables CSS; el texto encima pasa solo a blanco u oscuro (colorTextoSobre).
 * - Celular (contenedor < 640 px, T14 r1): tarjetas por línea, nombres completos (break-words) y las acciones fijas
 *   abajo.
 * - Impresión: 'Descargar o imprimir' (window.print); botones, acciones y aviso no se imprimen (print:hidden); el
 *   sello y la tabla sí, con los colores (print-color-adjust) y @page sin tamaño fijo.
 * Sin marca configurada no aparece ningún nombre de ejemplo: solo el tipo y el número del documento.
 */
export function DocumentoComercial({
  documento, marca, apiUrl, variante, acciones, sello, aviso, mostrarDescargar = true, fijarTitulo = false, metaDerecha,
  extraTotales, nivelTitulo = 1,
}: DocumentoComercialProps) {
  const Titulo = nivelTitulo === 2 ? 'h2' : 'h1';
  const nivelSeccion = nivelTitulo === 2 ? 3 : 2;
  const doc = normalizarDocumento(documento);
  const m = normalizarMarca(marca);
  const tipo = doc.tipo === 'SC' || doc.tipo === 'COT' || doc.tipo === 'PVEN' ? doc.tipo : null;
  const v = variante ?? (tipo ? TIPOS_DOCUMENTO[tipo].variante : 'acento');
  const titulo = tipo ? TIPOS_DOCUMENTO[tipo].titulo : doc.titulo.toUpperCase();
  const pestana = tituloDePestana(doc, m);

  useEffect(() => {
    if (fijarTitulo && pestana) document.title = pestana;
  }, [fijarTitulo, pestana]);

  const { principal, secundario, acento } = m.colores;
  const variables = {
    '--doc-principal': principal,
    '--doc-secundario': secundario,
    '--doc-acento': acento,
    '--doc-sobre-franja': colorTextoSobre(principal, secundario),
    '--doc-sobre-acento': colorTextoSobre(acento),
    '--doc-acento-texto': colorSobreBlanco(acento),
  } as CSSProperties;

  const fecha = fechaLarga(doc.fecha_emision);
  const entrega = textoEntregaEstimada(doc);
  const forma = formaDePagoDocumento(doc);
  const filas = filasTotales(doc);
  const contactos = contactosEmpresa(m, mensajeWhatsAppDocumento(tipo ?? 'SC', doc.numero));
  const legal = [m.razon_social, m.nit ? `NIT ${m.nit}` : ''].filter(Boolean).join(' · ');
  const ubicacion = [m.direccion, m.ciudad].filter(Boolean).join(', ');
  const cliente = doc.cliente;

  const meta = (
    <dl className="space-y-1 text-sm">
      {fecha && (
        <div>
          <dt className="inline font-semibold">Fecha: </dt>
          <dd className="inline">{fecha}</dd>
        </div>
      )}
      {entrega && (
        <div>
          <dt className="inline font-semibold">Entrega estimada: </dt>
          <dd className="inline">{entrega}</dd>
        </div>
      )}
      {(metaDerecha ?? []).map((item) => (
        <div key={item.etiqueta}>
          <dt className="inline font-semibold">{item.etiqueta}: </dt>
          <dd className="inline">{item.valor}</dd>
        </div>
      ))}
    </dl>
  );

  const para = (cliente.nombre || cliente.direccion_entrega) && (
    <div className="min-w-0 text-sm">
      <p className="font-semibold">Para:</p>
      {cliente.nombre && <p className="break-words">{cliente.nombre}</p>}
      {cliente.direccion_entrega && <p className="break-words opacity-90">{cliente.direccion_entrega}</p>}
    </div>
  );

  const formaDePago = forma && (forma.etiqueta || forma.texto || forma.instrucciones) && (
    <Seccion titulo="Forma de pago" nivel={nivelSeccion}>
      {forma.etiqueta && <p className="font-semibold text-gray-900">{forma.etiqueta}</p>}
      {forma.texto && <p className="text-sm text-gray-800">{forma.texto}</p>}
      {forma.instrucciones && (
        <div className="pt-1">
          <p className="text-xs font-semibold text-gray-600">Datos para pagar</p>
          <p className="whitespace-pre-line break-words text-sm text-gray-800">{forma.instrucciones}</p>
        </div>
      )}
    </Seccion>
  );

  return (
    // T14 r1: los cortes se miden con este contenedor (@container), no con la ventana: la vista previa de Configuración
    // (~380 px a 1024) sale en tarjetas. 40rem = los 640 px del corte sm de antes; en la página pública el contenedor
    // es casi la ventana, así que se ve igual.
    <div className="@container w-full">
      <style>{ESTILOS_IMPRESION}</style>
      {(aviso || mostrarDescargar) && (
        <div className="mx-auto mb-3 flex w-full max-w-[820px] flex-col gap-3 print:hidden">
          {aviso}
          {mostrarDescargar && (
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              <span className="text-xs text-gray-500">Si no se abre, usa ⋮ › Abrir en el navegador</span>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 print:hidden"
              >
                <Printer size={16} aria-hidden="true" />
                Descargar o imprimir
              </button>
            </div>
          )}
        </div>
      )}

      <article
        className="documento-comercial relative mx-auto w-full max-w-[820px] overflow-hidden rounded-2xl bg-white text-gray-900 shadow-lg print:rounded-none"
        style={variables}
        aria-label={[titulo, doc.numero].filter(Boolean).join(' ')}
      >
        {v === 'degradado' ? (
          <>
            <header
              className="px-5 pb-14 pt-6 @min-[40rem]:px-8"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--doc-principal), var(--doc-secundario))', color: 'var(--doc-sobre-franja)' }}
            >
              <div className="flex flex-col gap-5 @min-[40rem]:flex-row @min-[40rem]:items-start @min-[40rem]:justify-between">
                <div className="min-w-0 space-y-3">
                  <LogoMarca marca={m} apiUrl={apiUrl} sobre="franja" />
                  <div className="flex flex-wrap items-center gap-3">
                    <Titulo className="text-3xl font-extrabold tracking-wide @min-[40rem]:text-4xl">{titulo}</Titulo>
                    {sello && <Sello sello={sello} />}
                  </div>
                  {doc.numero && <p className="break-words text-sm font-semibold"># {doc.numero}</p>}
                </div>
                <div className="space-y-3 @min-[40rem]:max-w-[45%] @min-[40rem]:text-right">
                  {meta}
                  {para}
                </div>
              </div>
            </header>
            <div className="relative -mt-8 px-3 @min-[40rem]:px-6">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md">
                <Lineas doc={doc} variante="degradado" />
              </div>
            </div>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2 bg-gray-900" />
            <span
              aria-hidden="true"
              className="absolute right-0 top-0 h-14 w-14"
              style={{ backgroundColor: 'var(--doc-acento)', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }}
            />
            <span
              aria-hidden="true"
              className="absolute bottom-0 right-0 h-10 w-10"
              style={{ backgroundColor: 'var(--doc-acento)', clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
            />
            <header className="space-y-6 py-6 pl-7 pr-5 @min-[40rem]:pl-10 @min-[40rem]:pr-16">
              <div className="flex flex-col gap-4 @min-[40rem]:flex-row @min-[40rem]:items-start @min-[40rem]:justify-between">
                <div className="min-w-0 space-y-1">
                  <LogoMarca marca={m} apiUrl={apiUrl} />
                  {legal && <p className="break-words text-xs text-gray-600">{legal}</p>}
                </div>
                <div className="space-y-1 @min-[40rem]:text-right">
                  <div className="flex flex-wrap items-center gap-3 @min-[40rem]:justify-end">
                    {sello && <Sello sello={sello} />}
                    <Titulo className="text-2xl font-extrabold tracking-wide @min-[40rem]:text-3xl" style={{ color: 'var(--doc-acento-texto)' }}>
                      {titulo}
                    </Titulo>
                  </div>
                  {doc.numero && <p className="break-words text-sm font-semibold text-gray-700">N.º {doc.numero}</p>}
                </div>
              </div>
              <div className="flex flex-col gap-4 border-t border-gray-200 pt-4 text-gray-800 @min-[40rem]:flex-row @min-[40rem]:justify-between">
                {para || <span />}
                <div className="@min-[40rem]:text-right">{meta}</div>
              </div>
            </header>
            <div className="pl-5 pr-3 @min-[40rem]:pl-10 @min-[40rem]:pr-8">
              <Lineas doc={doc} variante="acento" />
            </div>
          </>
        )}

        <div className="space-y-6 px-5 py-6 @min-[40rem]:pl-10 @min-[40rem]:pr-8">
          {doc.con_precios ? (
            <div className="grid gap-6 @min-[40rem]:grid-cols-2">
              <div className="space-y-5">
                {formaDePago}
                {doc.terminos && (
                  <Seccion titulo="Términos y condiciones" nivel={nivelSeccion}>
                    <p className="whitespace-pre-line break-words text-sm text-gray-800">{doc.terminos}</p>
                  </Seccion>
                )}
              </div>
              <div className="space-y-4">
                <Totales filas={filas} variante={v} />
                {extraTotales}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {formaDePago}
              {extraTotales}
              {doc.terminos && (
                <Seccion titulo="Términos y condiciones" nivel={nivelSeccion}>
                  <p className="whitespace-pre-line break-words text-sm text-gray-800">{doc.terminos}</p>
                </Seccion>
              )}
            </div>
          )}

          {doc.notas.map((nota, i) => (
            <Seccion key={`${nota.titulo ?? 'Notas'}-${i}`} titulo={nota.titulo ?? 'Notas'} nivel={nivelSeccion}>
              <p className="whitespace-pre-line break-words rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
                {nota.texto}
              </p>
            </Seccion>
          ))}

          <footer className="space-y-2 border-t border-gray-200 pt-4 text-xs text-gray-600">
            {doc.mensaje_pie && <p className="whitespace-pre-line break-words text-sm font-semibold text-gray-800">{doc.mensaje_pie}</p>}
            {contactos.length > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {contactos.map((c) => {
                  const Icono = ICONOS_CONTACTO[c.tipo];
                  return (
                    <li key={c.tipo} className="min-w-0">
                      {c.externo ? (
                        <a href={c.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all hover:underline">
                          <Icono size={13} aria-hidden="true" />
                          {c.texto}
                        </a>
                      ) : (
                        <a href={c.href} className="inline-flex items-center gap-1 break-all hover:underline">
                          <Icono size={13} aria-hidden="true" />
                          {c.texto}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {ubicacion && <p className="break-words">{ubicacion}</p>}
            {legal && <p className="break-words">{legal}</p>}
            {doc.atendido_por && <p className="break-words">Atendido por: {doc.atendido_por}</p>}
          </footer>
        </div>
      </article>

      {acciones && (
        <div className="sticky bottom-0 z-10 mx-auto mt-4 w-full max-w-[820px] border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] @min-[40rem]:static @min-[40rem]:border-0 @min-[40rem]:bg-transparent @min-[40rem]:px-0 @min-[40rem]:shadow-none print:hidden">
          {acciones}
        </div>
      )}
    </div>
  );
}
