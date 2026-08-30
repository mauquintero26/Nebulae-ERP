import os
import re

path = 'src/components/Sidebar.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Update Inventario Sub-items
old_inventario_pattern = r"name: 'Inventario',\s*path: '/dashboard/inventario',\s*icon: Archive,\s*subItems: \[[^\]]*\]"

new_inventario = """name: 'Inventario', 
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
          ]"""

text = re.sub(old_inventario_pattern, new_inventario, text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Sidebar updated successfully for Inventario")
