import re

with open('src/app/dashboard/website/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

import_pattern = r'import \{\s*[\s\S]*?\}\s*from \'lucide-react\';'

new_imports = "import { Monitor, Smartphone, Tablet, ChevronLeft, ChevronRight, ChevronDown, Send, Sparkles, LayoutTemplate, Type, Image as ImageIcon, Palette, MousePointer2, Layers, Settings, Play, CheckCircle2, Undo2, Redo2, Save, ExternalLink, Plus } from 'lucide-react';"

content = re.sub(import_pattern, new_imports, content)

with open('src/app/dashboard/website/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed all website imports")
