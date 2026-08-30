import re

with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# CRM Calendar addition
crm_pattern = r"      \{\s*name: 'CRM', path: '/dashboard/crm', icon: KanbanSquare \},"
new_crm = """      { 
        name: 'CRM', 
        path: '/dashboard/crm', 
        icon: KanbanSquare,
        subItems: [
          { name: '📊 Tablero Kanban', path: '/dashboard/crm' },
          { name: '📅 Calendario Asesor', path: '/dashboard/crm/calendario' }
        ]
      },"""
content = re.sub(crm_pattern, new_crm, content)

# Inventario Calendar addition
inv_pattern = r"\{ name: '🔄 Movimientos \(Kardex\)', path: '/dashboard/inventario/kardex' \},"
new_inv = "{ name: '🔄 Movimientos (Kardex)', path: '/dashboard/inventario/kardex' },\n          { name: '📅 Calendario Logístico', path: '/dashboard/inventario/calendario' },"
content = re.sub(inv_pattern, new_inv, content)

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
