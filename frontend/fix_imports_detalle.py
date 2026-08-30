import re

path = 'src/app/dashboard/ventas/solicitud/[id]/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'Image as ImageIcon, HelpCircle, Package, Archive, Box',
    'Image as ImageIcon, HelpCircle, Package, Archive, Box, Plus, Search'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed missing imports")
