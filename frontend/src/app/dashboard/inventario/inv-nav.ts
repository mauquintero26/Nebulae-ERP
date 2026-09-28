// Lista canonica del submenu de Inventario. Antes cada page.tsx mantenia su
// propia copia local -- fueron divergiendo (algunas decian "Stock", otras
// "Stock y Catalogo"; Kardex se agrego a si mismo pero a ninguna otra pagina
// se le agrego de vuelta), asi que el set de pestañas visibles cambiaba
// segun desde que pagina del hub entraras. Una sola fuente evita que se
// repita.
export const INV_NAV = [
  { name: 'Productos',      path: '/dashboard/inventario/productos' },
  { name: 'Stock',          path: '/dashboard/inventario/stock' },
  { name: 'Kardex',         path: '/dashboard/inventario/kardex' },
  { name: 'Recepciones',    path: '/dashboard/inventario/recepciones' },
  { name: 'Entregas',       path: '/dashboard/inventario/entregas' },
  { name: 'Traslados',      path: '/dashboard/inventario/traslados' },
  { name: 'Ajustes',        path: '/dashboard/inventario/ajustes' },
  { name: 'Abastecimiento', path: '/dashboard/inventario/abastecimiento' },
  { name: 'Bodegas',        path: '/dashboard/inventario/bodegas' },
];
