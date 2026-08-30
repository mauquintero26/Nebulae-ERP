import re

with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace 'Calendario Asesor' with 'Seguimientos'
content = re.sub(r"'📅 Calendario Asesor'", r"'📅 Seguimientos'", content)
content = re.sub(r"name: '📅 Calendario Asesor'", r"name: '📅 Seguimientos'", content)

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Sidebar Updated")
