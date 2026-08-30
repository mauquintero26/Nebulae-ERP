import re

with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure icons are imported
imports_to_add = ["ShoppingCart", "Globe", "Megaphone", "Puzzle"]
import_pattern = r'import \{([\s\S]*?)\} from \'lucide-react\';'

def add_icons(match):
    imports = match.group(1)
    for icon in imports_to_add:
        if icon not in imports:
            imports += f", {icon}"
    return f"import {{{imports}}} from 'lucide-react';"

content = re.sub(import_pattern, add_icons, content)

# Define the new items to insert after Finanzas
new_items = """      { 
        name: 'E-Commerce', 
        path: '/dashboard/ecommerce', 
        icon: ShoppingCart,
      },
      { 
        name: 'Sitio Web', 
        path: '/dashboard/website', 
        icon: Globe,
      },
      { 
        name: 'Marketing', 
        path: '/dashboard/marketing', 
        icon: Megaphone,
      },
      { 
        name: 'Integraciones', 
        path: '/dashboard/integraciones', 
        icon: Puzzle,
        subItems: [
          { name: 'APIs', path: '/dashboard/integraciones/apis' },
          { name: 'MCP Agents', path: '/dashboard/integraciones/mcp' },
        ]
      },"""

# Insert after Finanzas block
finanzas_pattern = r'\{\s*name:\s*\'Finanzas\'[\s\S]*?\]\s*\},'

def insert_after_finanzas(match):
    return match.group(0) + "\n" + new_items

content = re.sub(finanzas_pattern, insert_after_finanzas, content)

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Sidebar updated with new items")
