import os
import re

path = 'src/components/Sidebar.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Let's fix the MENU_ITEMS array completely.
# Find the start of MENU_ITEMS and the start of {MENU_ITEMS.map
start_idx = text.find("const MENU_ITEMS = [")
end_idx = text.find("{MENU_ITEMS.map((group, idx) => (")

new_menu_items = """const MENU_ITEMS = [
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
      { name: 'E-Commerce', path: '/dashboard/ecommerce', icon: ShoppingCart },
      { name: 'Sitio Web', path: '/dashboard/website', icon: Globe },
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
      { name: 'Asistente IA', path: '/dashboard/asistente', icon: MessageSquare },
      { name: 'Promociones', path: '/dashboard/promociones', icon: Tag, disabled: true }
    ]},
    { group: 'Administrador', items: [
      { name: 'Empleados & Roles', path: '/dashboard/admin/empleados', icon: Users },
      { name: 'Ajustes de Módulos', path: '/dashboard/admin/ajustes', icon: SlidersHorizontal },
      { name: 'Config. General', path: '/dashboard/admin/configuracion', icon: Settings }
    ]}
  ];

  """

text = text[:start_idx] + new_menu_items + text[end_idx:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed MENU_ITEMS array structure")
