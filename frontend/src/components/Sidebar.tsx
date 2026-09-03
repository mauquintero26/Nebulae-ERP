"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, Users, CalendarDays, KanbanSquare,
  MessageSquare, ShoppingCart, TrendingUp, ShoppingBag, Archive,
  Globe, Megaphone, Puzzle, Sparkles, Tag, ChevronDown, ChevronRight,
  PanelLeftClose, PanelLeftOpen, LogOut, SlidersHorizontal, Settings
} from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const toggleMenu = (name: string) => {
    setOpenMenus(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const MENU_ITEMS = [
    { group: 'Dashboards', items: [
      { name: 'General', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Agenda de Clientes', path: '/dashboard/agenda', icon: Users },
      { name: 'Calendario', path: '/dashboard/calendario', icon: CalendarDays },
      { 
        name: 'CRM', 
        path: '/dashboard/crm', 
        icon: KanbanSquare,
        subItems: [
          { name: '📋 Tablero Kanban', path: '/dashboard/crm' },
          { name: '📅 Seguimientos', path: '/dashboard/crm/calendario' }
        ]
      },
      { name: 'Asistente Omnicanal', path: '/dashboard/asistente_omnicanal', icon: MessageSquare },
      { name: 'Cotiza', path: '/dashboard/cotiza', icon: ShoppingCart },
      { 
        name: 'Ventas', 
        path: '/dashboard/ventas', 
        icon: TrendingUp,
        subItems: [
          { name: '📝 Solicitud de Cliente', path: '/dashboard/ventas/solicitud' },
          { name: '📄 Cotización', path: '/dashboard/ventas/cotizacion' },
          { name: '💰 Pedido de Venta', path: '/dashboard/ventas/venta' },
          { name: '📤 Subir venta de chat exportado/ dia vigente', path: '/dashboard/ventas/exportar-dia' },
          { name: '📅 Subir venta de chat exportado/ Rango', path: '/dashboard/ventas/exportar-rango' },
          { name: '🔄 Sincronización DB', path: '/dashboard/ventas/sincronizacion' },
          { name: '📈 Proyecciones', path: '/dashboard/ventas/proyecciones' }
        ]
      },
      { 
        name: 'Compras', 
        path: '/dashboard/compras', 
        icon: ShoppingBag,
        subItems: [
          { name: '🛒 Pedido de Compra', path: '/dashboard/compras/pedidos' },
          { name: '🚚 Mercancía en Tránsito', path: '/dashboard/compras/transito' },
          { name: '📥 Recepciones', path: '/dashboard/compras/recepciones' },
          { name: '🔄 Traslados Internos', path: '/dashboard/compras/traslados' },
          { name: '📝 Registro (OCR/Manual)', path: '/dashboard/compras/registro' },
          { name: '📈 Proyecciones', path: '/dashboard/compras/proyecciones' }
        ]
      },
      { 
        name: 'Inventario', 
        path: '/dashboard/inventario', 
        icon: Archive,
        subItems: [
          { name: '📦 Stock y Catálogo', path: '/dashboard/inventario/stock' },
          { name: '📥 Recepciones', path: '/dashboard/inventario/recepciones' },
          { name: '📤 Entregas', path: '/dashboard/inventario/entregas' },
          { name: '🔄 Traslados Internos', path: '/dashboard/inventario/traslados' },
          { name: '⚖️ Ajustes de Inventario', path: '/dashboard/inventario/ajustes' },
          { name: '🛒 Abastecimiento', path: '/dashboard/inventario/abastecimiento' },
          { name: '🏢 Gestión de Almacenes', path: '/dashboard/inventario/almacenes' },
          { name: '📍 Ubicaciones Físicas', path: '/dashboard/inventario/ubicaciones' },
          { name: '🚚 Rutas', path: '/dashboard/inventario/rutas' },
          { name: '🤝 Inventario Compartido', path: '/dashboard/inventario/compartido' }
        ]
      },
      { 
        name: 'Finanzas', 
        path: '/dashboard/finanzas/resumen', 
        icon: TrendingUp,
        subItems: [
          { name: '📊 Dashboard P&L', path: '/dashboard/finanzas/resumen' },
          { name: '💸 Control de Gastos', path: '/dashboard/finanzas/gastos' }
        ]
      },
      { 
        name: 'E-Commerce', 
        path: '/dashboard/ecommerce', 
        icon: ShoppingCart,
        subItems: [
          { name: '🛒 E-Commerce Center', path: '/dashboard/ecommerce' },
          { name: '🌐 Sitio Web / Landing', path: '/dashboard/sitio-web' },
        ]
      },
      { 
        name: 'Marketing', 
        path: '/dashboard/marketing', 
        icon: Megaphone,
        subItems: [
          { name: '🌐 Flujos (Redes)', path: '/dashboard/marketing/flujos' },
          { name: '📸 Historias & Pubs', path: '/dashboard/marketing/historias' },
          { name: '🎯 Campañas', path: '/dashboard/marketing/campanas' },
          { name: '👥 Visitantes', path: '/dashboard/marketing/visitantes' }
        ]
      },
      { 
        name: 'Integraciones', 
        path: '/dashboard/integraciones', 
        icon: Puzzle,
        subItems: [
          { name: '🔌 APIs', path: '/dashboard/integraciones/apis' },
          { name: '🤖 MCP Agents', path: '/dashboard/integraciones/mcp' }
        ]
      }
    ]},
    { group: 'Herramientas', items: [
      { name: 'Scrapper', path: '/dashboard/scrapper', icon: Globe }
    ]},
    { group: 'Administrador', items: [
      { name: 'Empleados & Roles', path: '/dashboard/admin/empleados', icon: Users },
      { name: 'Ajustes de Módulos', path: '/dashboard/admin/ajustes', icon: SlidersHorizontal },
      { name: 'Config. General', path: '/dashboard/admin/configuracion', icon: Settings }
    ]}
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} transition-all duration-300 bg-white border-r border-slate-200 h-screen flex flex-col shadow-sm flex-shrink-0 relative`}>
      {/* Brand & Toggle */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-100 shrink-0">
        <div className="flex items-center overflow-hidden whitespace-nowrap">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-md flex-shrink-0">
            <Sparkles className="text-white w-4 h-4" />
          </div>
          {!isCollapsed && <h1 className="text-xl font-extrabold text-slate-900 tracking-tight ml-3">Nebulae Hub</h1>}
        </div>
        <button onClick={handleToggleCollapse} className="text-slate-400 hover:text-purple-600 focus:outline-none" title={isCollapsed ? "Expandir Menú" : "Contraer Menú"}>
          {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-6 px-3 space-y-8 scrollbar-hide">
        {MENU_ITEMS.map((group, idx) => (
          <div key={idx}>
            {!isCollapsed && (
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-3">
                {group.group}
              </h2>
            )}
            <ul className="space-y-1">
              {group.items.map((item, itemIdx) => {
                const Icon = item.icon;
                const isActive = pathname === item.path || (item.subItems && item.subItems.some(sub => pathname === sub.path));
                const hasSubItems = !!item.subItems;
                const isExpanded = openMenus[item.name];

                if (item.disabled) {
                  return (
                    <li key={itemIdx}>
                      <div className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-400 cursor-not-allowed ${isCollapsed ? 'justify-center' : ''}`} title={isCollapsed ? item.name : ''}>
                        <Icon className={`w-5 h-5 opacity-50 ${isCollapsed ? '' : 'mr-3'}`} />
                        {!isCollapsed && (
                          <>
                            {item.name}
                            <span className="ml-auto text-[10px] font-semibold bg-slate-100 text-slate-500 py-0.5 px-2 rounded-full">Dev</span>
                          </>
                        )}
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={itemIdx}>
                    <div className="flex flex-col">
                      <div className={`flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${isActive ? 'bg-purple-50 text-purple-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`} title={isCollapsed ? item.name : ''}>
                        <div className="flex items-center flex-1" onClick={() => window.location.href = item.path}>
                          <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-purple-600' : 'text-slate-400'} ${isCollapsed ? 'mx-auto' : 'mr-3'}`} />
                          {!isCollapsed && <span className="truncate">{item.name}</span>}
                        </div>
                        {!isCollapsed && hasSubItems && (
                          <div 
                            className="ml-auto flex-shrink-0 p-1 hover:bg-slate-200/50 rounded transition-colors" 
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMenu(item.name);
                            }}
                          >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        )}
                      </div>
                      
                      {/* Sub-Items */}
                      {!isCollapsed && hasSubItems && isExpanded && (
                        <ul className="mt-1 space-y-1 pl-10 border-l-2 border-slate-100 ml-5">
                          {item.subItems!.map((subItem, subIdx) => {
                            const isSubActive = pathname === subItem.path;
                            return (
                              <li key={subIdx}>
                                <Link 
                                  href={subItem.path} 
                                  className={`block px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                                    isSubActive ? 'text-purple-700 font-bold bg-purple-50/50' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                  }`}
                                >
                                  {subItem.name}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100 flex flex-col gap-2 shrink-0">
        <button 
          onClick={handleToggleCollapse}
          className={`flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg text-slate-500 hover:bg-slate-100 transition-colors ${isCollapsed ? 'justify-center' : ''}`}
          title={isCollapsed ? 'Expandir Menú' : 'Contraer Menú'}
        >
          {isCollapsed ? <PanelLeftOpen className="w-5 h-5 text-slate-400" /> : <PanelLeftClose className="w-5 h-5 text-slate-400 mr-3" />}
          {!isCollapsed && <span>Contraer Menú</span>}
        </button>

        <button 
          onClick={handleLogout}
          className={`flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors ${isCollapsed ? 'justify-center' : ''}`}
          title={isCollapsed ? 'Cerrar Sesión' : ''}
        >
          <LogOut className={`w-5 h-5 text-slate-400 group-hover:text-red-500 ${isCollapsed ? '' : 'mr-3'}`} />
          {!isCollapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </aside>
  );
}
