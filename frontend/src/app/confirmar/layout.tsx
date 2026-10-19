import type { Metadata } from 'next';

// B3 T15 (PLANTILLA punto 7, U17+H28, U22+H38; C7): el ÚNICO layout de /confirmar (no hay uno en [token]).
// - Los buscadores no indexan la página del cliente.
// - Sin Referer: la URL lleva el token del enlace y no debe viajar a WhatsApp, a la página web de la empresa ni al pedir
//   el logo.
// - La pestaña la pone la página con la empresa y el documento (tituloDeLaPagina: 'Solicitud SC-… · Empresa').
export const metadata: Metadata = {
  title: 'Documento',
  // T15 r1: sin la description de la raíz (la marca del ERP); Next junta la metadata por capas.
  description: null,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ConfirmarLayout({ children }: LayoutProps<'/confirmar'>) {
  return children;
}
