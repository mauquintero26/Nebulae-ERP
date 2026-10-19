import type { Metadata } from 'next';

// B3 T15 (U23 punto 10; C7): el layout de /pedido, igual al de /confirmar.
// - Los buscadores no indexan el pedido del cliente.
// - Sin Referer: la URL lleva el token del enlace y no debe viajar a WhatsApp, a la página web de la empresa ni al pedir
//   el logo.
// - La pestaña la pone la página ('Pedido de venta PVEN-… · Empresa').
export const metadata: Metadata = {
  title: 'Tu pedido',
  // T15 r1: sin la description de la raíz (la marca del ERP); Next junta la metadata por capas.
  description: null,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function PedidoLayout({ children }: LayoutProps<'/pedido'>) {
  return children;
}
