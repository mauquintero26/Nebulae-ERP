import re

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

import_pattern = r"import \{ \n  MessageCircle"
new_import = "import { \n  MessageCircle, Plus"
content = re.sub(import_pattern, new_import, content)

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Import added")
