import os

path = 'src/components/Sidebar.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace Herramientas block
old_block = """    { group: 'Herramientas', items: [
      { name: 'Asistente IA', path: '/dashboard/asistente', icon: MessageSquare },
      { name: 'Promociones', path: '/dashboard/promociones', icon: Tag, disabled: true }
    ]},"""

new_block = """    { group: 'Herramientas', items: [
      { name: 'Scrapper', path: '/dashboard/scrapper', icon: Globe }
    ]},"""

text = text.replace(old_block, new_block)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated Sidebar Herramientas section.")
