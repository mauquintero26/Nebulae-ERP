import re

with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to find the Ventas subItems
ventas_pattern = r'\{\s*name:\s*\'Ventas\',\s*path:\s*\'/dashboard/ventas\',[\s\S]*?subItems:\s*\[([\s\S]*?)\]\s*\},'

new_sub_items = """
          { name: '📝 Solicitud de Cliente', path: '/dashboard/ventas/solicitud' },
          { name: '📄 Cotización', path: '/dashboard/ventas/cotizacion' },
          { name: '💰 Venta', path: '/dashboard/ventas/venta' },
          { name: '📊 Subir venta de chat exportado/ dia vigente', path: '/dashboard/ventas/exportar-dia' },
          { name: '📅 Subir venta de chat exportado/ Rango', path: '/dashboard/ventas/exportar-rango' },
          { name: '🔄 Sincronización DB', path: '/dashboard/ventas/sincronizacion' },
          { name: '📈 Proyecciones', path: '/dashboard/ventas/proyecciones' },
"""

def replace_ventas_subitems(match):
    full_match = match.group(0)
    old_subitems = match.group(1)
    new_full_match = full_match.replace(old_subitems, new_sub_items)
    return new_full_match

new_content = re.sub(ventas_pattern, replace_ventas_subitems, content)

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
    
print("Updated Ventas menu successfully.")
