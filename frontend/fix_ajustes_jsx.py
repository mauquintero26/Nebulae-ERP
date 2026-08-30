import os

path = 'src/app/dashboard/admin/ajustes/page.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("descuentos > 10%", "descuentos &gt; 10%")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed raw > token in ajustes")
