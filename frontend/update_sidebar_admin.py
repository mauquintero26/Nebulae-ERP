import re

path = 'src/components/Sidebar.tsx'

with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Add Administrador group to MENU_ITEMS
admin_group = """
    { group: 'Administrador', items: [
      { name: 'Empleados & Roles', path: '/dashboard/admin/empleados', icon: Users },
      { name: 'Ajustes de Módulos', path: '/dashboard/admin/ajustes', icon: SlidersHorizontal },
      { name: 'Config. General', path: '/dashboard/admin/configuracion', icon: Settings },
    ]}
  ];
"""

# Replace the end of MENU_ITEMS
if "group: 'Administrador'" not in text:
    text = text.replace("    ]}\n  ];", "    ]},\n" + admin_group)

# Add missing icons to import
icons_to_add = ["Users", "SlidersHorizontal", "Settings"]
for icon in icons_to_add:
    if icon not in text.split("} from 'lucide-react';")[0]:
        text = text.replace("} from 'lucide-react';", f", {icon} }} from 'lucide-react';")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Added Administrador to Sidebar")
