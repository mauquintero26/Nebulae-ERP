import os
import re

path = 'src/components/Sidebar.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Make sure it has SlidersHorizontal, Settings in lucide-react import
if "SlidersHorizontal" not in text:
    text = text.replace("} from 'lucide-react';", ", SlidersHorizontal, Settings } from 'lucide-react';")

admin_block = """
    { group: 'Administrador', items: [
      { name: 'Empleados & Roles', path: '/dashboard/admin/empleados', icon: Users },
      { name: 'Ajustes de Módulos', path: '/dashboard/admin/ajustes', icon: SlidersHorizontal },
      { name: 'Config. General', path: '/dashboard/admin/configuracion', icon: Settings },
    ]}
  ];"""

# We'll replace the closing of MENU_ITEMS
# Usually it's something like:
#     ]}
#   ];
if "group: 'Administrador'" not in text:
    pattern = r'\}\]\s*\}\s*\];'
    text = re.sub(pattern, ']}\n    },\n' + admin_block, text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Injected Administrador explicitly via regex")
