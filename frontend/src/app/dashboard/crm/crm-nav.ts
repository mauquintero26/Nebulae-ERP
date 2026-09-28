// Lista canonica del submenu de CRM. calendario/page.tsx ya traia esta lista
// (apuntando de vuelta al tablero Kanban) pero crm/page.tsx -- el tablero en
// si, la raiz del hub -- no la mostraba en ningun lado: no habia forma de
// llegar a Seguimientos desde el Kanban salvo escribiendo la URL a mano.
export const CRM_NAV = [
  { name: 'Tablero Kanban', path: '/dashboard/crm' },
  { name: 'Seguimientos',   path: '/dashboard/crm/calendario' },
];
