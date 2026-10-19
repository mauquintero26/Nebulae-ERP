'use client';

import { ContactoEmpresa, DocumentoComercial } from '@/components/documento';
import { metaDeLaVista, selloDeLaVista, textoAntesDeConfirmar } from '@/lib/confirmacion-publica';
import { coloresBotonPrincipal } from '@/lib/documento-comercial';
import { AccionesConfirmar, QuePasaSiConfirmo, type PropsVista } from './vista-solicitud';

/**
 * La cotización que ve el cliente (B3 T15: U22+H38 puntos 6 a 8, U22-cambios punto 6, U22-validez punto 10; C3, R10):
 * DocumentoComercial en la variante 'acento' (hoja blanca con acento), con cantidad, descripción, precio unitario y
 * total de cada línea, los totales con el IVA, la forma de pago con el anticipo y los datos para pagar. Aquí solo se
 * arman:
 * - el encabezado: 'Esperando tu confirmación' y 'Válida hasta …' (metaDeLaVista), y el sello 'Confirmada';
 * - bajo los totales: «¿Qué pasa si confirmo?» (el anticipo que sigue, textoAntesDeConfirmar) y el contacto, sin
 *   imprimir;
 * - los botones 'Confirmar cotización' y 'Pedir cambios' (o el panel de cambios compartido, que los reemplaza).
 * En soloLectura (recién confirmada) la hoja queda sin botones, bajo el aviso con «¿Qué sigue?».
 */
export function VistaCotizacion({
  vista, apiUrl, soloLectura = false, aviso, onConfirmar, confirmando = false, onPedirCambios, errorAccion, panel,
}: PropsVista) {
  const doc = vista.documento;
  const colores = coloresBotonPrincipal(vista.empresa, 'acento');
  const extra = soloLectura ? undefined : (
    <div className="space-y-4">
      <QuePasaSiConfirmo texto={textoAntesDeConfirmar(doc)} />
      <div className="print:hidden">
        <ContactoEmpresa empresa={vista.empresa} asesor={doc?.atendido_por} numero={doc?.numero} tipo="COT" />
      </div>
    </div>
  );
  const acciones = soloLectura || panel ? undefined : (
    <AccionesConfirmar
      etiqueta="Confirmar cotización"
      colores={colores}
      onConfirmar={onConfirmar}
      confirmando={confirmando}
      onPedirCambios={onPedirCambios}
      error={errorAccion}
    />
  );
  return (
    <>
      <DocumentoComercial
        documento={doc}
        marca={vista.empresa}
        apiUrl={apiUrl}
        variante="acento"
        sello={selloDeLaVista(vista)}
        aviso={aviso}
        metaDerecha={metaDeLaVista(vista)}
        extraTotales={extra}
        acciones={acciones}
        nivelTitulo={aviso ? 2 : 1}
      />
      {!soloLectura && panel}
    </>
  );
}
