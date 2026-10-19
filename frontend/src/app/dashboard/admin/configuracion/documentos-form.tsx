'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Eye, Palette, RefreshCw, RotateCcw, Save, FileText } from 'lucide-react';
import { API_URL } from '@/lib/api';
import { BTN, TABS_BAR } from '@/lib/design-system';
import { documentoVistaPrevia } from '@/lib/documento-comercial';
import {
  CAMPOS_COLOR, CAMPOS_EMPRESA, GRUPOS_CAMPOS_EMPRESA, MARCA_VACIA, cargarMarcaEmpresa, marcaVistaPrevia,
} from '@/lib/marca-empresa';
import { DocumentoComercial } from '@/components/documento';
import {
  AvisoSoloLectura, Campo, ErrorDelServidor, EstadoDeCarga, ESTILO_CAMPO, useFormularioEmpresa,
} from './empresa-form';

/**
 * «Diseño de documentos» de Configuración General (Bloque 3, T14: PLANTILLA punto 9, C1, C26, R8): los colores de los
 * documentos del cliente, los términos de la cotización y del pedido, los datos para pagar (datos_pago = Sí: solo en la
 * cotización y el pedido, para quien tenga el enlace) y el mensaje de pie. Se guarda igual que «Información de la
 * empresa» (useFormularioEmpresa: PUT /empresa solo con lo que cambió; el error del servidor queda en el formulario).
 * - Vista previa en vivo con DocumentoComercial y un ejemplo DEMO (Solicitud o Cotización): los colores y los textos
 *   sin guardar, con la identidad y el logo que ve el cliente (GET /publico/empresa, C26). Incluye el encabezado (C1).
 * - Los documentos usan los colores de la marca; la pantalla, los tokens internos.
 */

// Una constante del módulo: useFormularioEmpresa la recibe estable.
const CAMPOS_FORM = Object.freeze([...GRUPOS_CAMPOS_EMPRESA.colores, ...GRUPOS_CAMPOS_EMPRESA.textos]);

const AYUDA_COLOR: Record<string, string> = {
  color_principal: 'Inicio del degradado de la solicitud.',
  color_secundario: 'Final del degradado de la solicitud.',
  color_acento: 'Título, esquinas y total de la cotización y del pedido.',
};

const DETALLES_TEXTO: Record<string, { filas: number; placeholder: string; ayuda: string }> = {
  terminos_cotizacion: { filas: 5, placeholder: 'Por ejemplo: validez de la oferta, tiempos de entrega, garantía…',
    ayuda: 'Salen al final de la cotización.' },
  terminos_pedido: { filas: 5, placeholder: 'Por ejemplo: cambios, devoluciones y entrega…',
    ayuda: 'Salen al final del pedido.' },
  instrucciones_pago: { filas: 4, placeholder: 'Banco, tipo y número de cuenta, titular, Nequi…',
    ayuda: 'Salen en la cotización y en el pedido. Solo los ve quien tenga el enlace del documento.' },
  mensaje_pie: { filas: 2, placeholder: 'Por ejemplo: ¡Gracias por tu compra!',
    ayuda: 'Una frase corta al pie de todos los documentos.' },
};

const VISTAS = [
  { tipo: 'SC', etiqueta: 'Solicitud' },
  { tipo: 'COT', etiqueta: 'Cotización' },
] as const;
type TipoVista = (typeof VISTAS)[number]['tipo'];

// r1: «Volver al color de la referencia» parte de BTN.ghost (design-system.ts), pequeño y en el índigo de BTN.primary.
const BTN_VOLVER = BTN.ghost.replace('px-4 py-2', 'px-2 py-1').replace('text-gray-600', 'text-indigo-600')
  .replace('hover:bg-gray-100', 'hover:bg-indigo-50').replace('text-sm', 'text-xs');

/** La pestaña «Diseño de documentos». `activo`: la pestaña está a la vista (recarga la marca pública). */
export function FormDocumentos({ activo = true }: { activo?: boolean }) {
  const f = useFormularioEmpresa(CAMPOS_FORM, 'Diseño de los documentos guardado');
  const [publica, setPublica] = useState<unknown>(MARCA_VACIA);
  const [vista, setVista] = useState<TipoVista>('COT');

  // La identidad y el logo de la vista previa son los que ve el cliente; se cambian en «Información de la empresa»,
  // así que se vuelven a pedir cada vez que se abre esta pestaña. cargarMarcaEmpresa nunca lanza.
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    cargarMarcaEmpresa(API_URL).then((m) => {
      if (vigente) setPublica(m);
    });
    return () => {
      vigente = false;
    };
  }, [activo]);

  const marca = marcaVistaPrevia(publica, f.valores);

  async function alGuardar(e: FormEvent) {
    e.preventDefault();
    await f.guardar();
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-black text-slate-800 border-b border-slate-100 pb-4">Diseño de documentos</h2>
      <p className="-mt-4 text-sm text-slate-500">
        Los colores y los textos de la solicitud, la cotización y el pedido que recibe tu cliente.
      </p>

      {f.carga.estado !== 'listo' ? (
        <EstadoDeCarga carga={f.carga} onReintentar={f.cargar} />
      ) : (
        <>
          <form onSubmit={alGuardar} noValidate className="space-y-8">
            {!f.puedeEditar && <AvisoSoloLectura />}
            <fieldset disabled={!f.puedeEditar || f.guardando} className="min-w-0 space-y-4">
              <legend className="mb-4 flex items-center gap-2 text-base font-black text-slate-800">
                <Palette size={16} className="text-slate-400" aria-hidden="true" /> Colores
              </legend>
              {/* r1: una columna hasta que el contenedor tiene espacio (a 1024 px el hex se cortaba en tres). */}
              <div className="grid grid-cols-1 gap-5 @2xl:grid-cols-3">
                {CAMPOS_COLOR.map(({ campo, nombre, referencia }) => {
                  const etiqueta = CAMPOS_EMPRESA[campo].etiqueta;
                  return (
                    <Campo key={campo} etiqueta={etiqueta} ayuda={AYUDA_COLOR[campo]} error={f.errores[campo]}>
                      {(props) => (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={marca.colores[nombre].toLowerCase()}
                              onChange={(e) => f.cambiar(campo, e.target.value.toUpperCase())}
                              aria-label={`Elegir el ${etiqueta.toLowerCase()}`}
                              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1 disabled:cursor-not-allowed"
                            />
                            <input
                              {...props}
                              type="text"
                              value={f.valores[campo]}
                              onChange={(e) => f.cambiar(campo, e.target.value.toUpperCase())}
                              onBlur={() => f.validar(campo)}
                              placeholder={referencia}
                              maxLength={CAMPOS_EMPRESA[campo].maximo}
                              spellCheck={false}
                              autoComplete="off"
                              className={`${ESTILO_CAMPO} font-mono`}
                            />
                          </div>
                          {f.puedeEditar && (
                            <button type="button" onClick={() => f.cambiar(campo, referencia)} className={BTN_VOLVER}>
                              <RotateCcw size={12} aria-hidden="true" /> Volver al color de la referencia
                            </button>
                          )}
                        </div>
                      )}
                    </Campo>
                  );
                })}
              </div>
            </fieldset>

            <fieldset disabled={!f.puedeEditar || f.guardando} className="min-w-0 space-y-5">
              <legend className="mb-4 flex items-center gap-2 text-base font-black text-slate-800">
                <FileText size={16} className="text-slate-400" aria-hidden="true" /> Textos de los documentos
              </legend>
              {GRUPOS_CAMPOS_EMPRESA.textos.map((campo) => {
                const d = DETALLES_TEXTO[campo];
                return (
                  <Campo key={campo} etiqueta={CAMPOS_EMPRESA[campo].etiqueta} ayuda={d?.ayuda} error={f.errores[campo]}>
                    {(props) => (
                      <textarea
                        {...props}
                        rows={d?.filas ?? 3}
                        value={f.valores[campo]}
                        onChange={(e) => f.cambiar(campo, e.target.value)}
                        onBlur={() => f.validar(campo)}
                        placeholder={d?.placeholder}
                        maxLength={CAMPOS_EMPRESA[campo].maximo}
                        className={`${ESTILO_CAMPO} resize-y`}
                      />
                    )}
                  </Campo>
                );
              })}
            </fieldset>

            <ErrorDelServidor mensaje={f.errorServidor} />

            {f.puedeEditar && (
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={!f.hayCambios || f.guardando} className={`${BTN.primary} disabled:opacity-50 disabled:cursor-not-allowed`}>
                  {f.guardando ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
                  {f.guardando ? 'Guardando…' : 'Guardar'}
                </button>
                {f.hayCambios
                  ? <span className="text-xs font-semibold text-amber-700">La vista previa ya muestra los cambios sin guardar.</span>
                  : <span className="text-xs text-slate-400">Sin cambios por guardar.</span>}
              </div>
            )}
          </form>

          <section className="space-y-4 border-t border-slate-100 pt-6" aria-labelledby="vista-previa-documentos">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="vista-previa-documentos" className="flex items-center gap-2 text-base font-black text-slate-800">
                <Eye size={16} className="text-slate-400" aria-hidden="true" /> Vista previa
              </h3>
              <div className={TABS_BAR.group} role="group" aria-label="Documento de la vista previa">
                {VISTAS.map((v) => (
                  <button
                    key={v.tipo}
                    type="button"
                    aria-pressed={vista === v.tipo}
                    onClick={() => setVista(v.tipo)}
                    className={vista === v.tipo ? TABS_BAR.tabActive : TABS_BAR.tabInactive}
                  >
                    {v.etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Un ejemplo con datos DEMO, con tus colores y tus textos aunque no los hayas guardado. La solicitud no lleva
              términos ni datos para pagar.
            </p>
            <div className="rounded-2xl bg-slate-100 p-2 @xl:p-6">
              <DocumentoComercial
                documento={documentoVistaPrevia(vista, f.valores)}
                marca={marca}
                apiUrl={API_URL}
                mostrarDescargar={false}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
