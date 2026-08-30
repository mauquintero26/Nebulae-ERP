import re

path = 'src/components/Sidebar.tsx'
with open(path, 'rb') as f:
    content = f.read()

# Force decode, replace broken chars
text = content.decode('utf-8', errors='replace')

# Clean up broken characters
text = text.replace('Sincronizacin', 'Sincronización')
text = text.replace('Catǭlogo', 'Catálogo')
text = text.replace('Logstico', 'Logístico')
text = text.replace('"rdenes', 'Órdenes')
text = text.replace('Y"?', '📋')
text = text.replace('Y""', '🔄')
text = text.replace('Y"^', '📈')
text = text.replace('Y"S', '📊')
text = text.replace('Y".', '📅')
text = text.replace('Y"', '📦')
text = text.replace('Y?', '🏢')
text = text.replace('Y>', '📑')
text = text.replace('Y"', '🧾')

# Update Compras Sub-items
old_compras_pattern = r"name: 'Compras',\s*path: '/dashboard/compras',\s*icon: ShoppingBag,\s*subItems: \[[^\]]*\]"

new_compras = """name: 'Compras', 
          path: '/dashboard/compras', 
          icon: ShoppingBag,
          subItems: [
            { name: '🛒 Pedido de Compra', path: '/dashboard/compras/pedidos' },
            { name: '🚢 Mercancía en Tránsito', path: '/dashboard/compras/transito' },
            { name: '📥 Recepciones', path: '/dashboard/compras/recepciones' },
            { name: '🔄 Traslados Internos', path: '/dashboard/compras/traslados' },
            { name: '📋 Registro (OCR/Manual)', path: '/dashboard/compras/registro' },
            { name: '📈 Proyecciones', path: '/dashboard/compras/proyecciones' }
          ]"""

text = re.sub(old_compras_pattern, new_compras, text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Sidebar updated successfully for Compras")
