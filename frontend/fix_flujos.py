import os

path = 'src/app/dashboard/marketing/flujos/page.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("Linkedin,", "Monitor,")
content = content.replace("<Linkedin size={18} />", "<Monitor size={18} />")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed Lucide icon import in Flujos")
