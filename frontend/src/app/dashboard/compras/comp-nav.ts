// Lista canonica del submenu de Compras. Igual que INV_NAV: antes cada
// page.tsx traia su propia copia -- historial/transito/traslados/recepciones
// habian perdido "Lista de Compras" de su copia local (solo el landing,
// pedidos y lista-compras la conservaban), asi que el set de pestañas visibles
// cambiaba segun desde que pagina del hub entraras. Una sola fuente evita que
// se repita.
export const COMP_NAV = [
  { name: 'Lista de Compras',      path: '/dashboard/compras/lista-compras' },
  { name: 'Pedidos de Compra',     path: '/dashboard/compras/pedidos' },
  { name: 'Mercancia en Transito', path: '/dashboard/compras/transito' },
  { name: 'Recepciones (Entrada)', path: '/dashboard/compras/recepciones' },
  { name: 'Traslados Internos',    path: '/dashboard/compras/traslados' },
  { name: 'Registro OCR/Manual',   path: '/dashboard/compras/registro' },
  { name: 'Proyecciones',          path: '/dashboard/compras/proyecciones' },
];
