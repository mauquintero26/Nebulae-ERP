import re

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the ending
content = re.sub(r"    <\/div>\s*<\/div>\s*\);\s*\}", "    </div>\n  );\n}", content)

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Extra div removed")
