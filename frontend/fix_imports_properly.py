import re

with open('src/app/dashboard/website/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

import_pattern = r'import \{([\s\S]*?)\} from \'lucide-react\';'

def add_icons(match):
    imports = match.group(1)
    if 'ChevronRight' not in imports:
        imports += ", ChevronRight, ChevronDown"
    return f"import {{{imports}}} from 'lucide-react';"

content = re.sub(import_pattern, add_icons, content)

with open('src/app/dashboard/website/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed website imports")
