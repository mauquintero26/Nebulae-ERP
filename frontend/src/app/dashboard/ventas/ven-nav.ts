// Lista canonica del submenu de Ventas. Mismo patron que COMP_NAV/INV_NAV: una
// sola fuente para que ninguna pagina del hub muestre un set de pestañas
// distinto a las demas.
export const VEN_NAV = [
  { name: 'Solicitud de Cliente', path: '/dashboard/ventas/solicitud' },
  { name: 'Cotización',           path: '/dashboard/ventas/cotizacion' },
  { name: 'Pedido de Venta',      path: '/dashboard/ventas/venta' },
  { name: 'Exportar Día',         path: '/dashboard/ventas/exportar-dia' },
  { name: 'Exportar Rango',       path: '/dashboard/ventas/exportar-rango' },
  { name: 'Sincronización DB',    path: '/dashboard/ventas/sincronizacion' },
  { name: 'Proyecciones',         path: '/dashboard/ventas/proyecciones' },
];
