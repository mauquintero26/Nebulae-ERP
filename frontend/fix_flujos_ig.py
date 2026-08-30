import os

path = 'src/app/dashboard/marketing/flujos/page.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("Instagram, Monitor", "Camera, Monitor")
content = content.replace("<Instagram size={18} />", "<Camera size={18} />")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed Instagram icon import in Flujos")
