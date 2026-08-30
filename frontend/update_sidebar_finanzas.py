import re

with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

finanzas_block = """      { 
        name: 'Finanzas', 
        path: '/dashboard/finanzas/resumen', 
        icon: TrendingUp,
        subItems: [
          { name: '📊 Dashboard P&L', path: '/dashboard/finanzas/resumen' },
          { name: '💸 Control de Gastos', path: '/dashboard/finanzas/gastos' },
        ]
      },
"""

# Let's insert it right after the Inventario block.
# We'll match the end of Inventario block.
inv_pattern = r"      \{\s*name: 'Inventario',.*?subItems: \[.*?\].*?\},"
inv_match = re.search(inv_pattern, content, flags=re.DOTALL)

if inv_match:
    inv_block = inv_match.group(0)
    # Don't add if already exists
    if "'Finanzas'" not in content:
        content = content.replace(inv_block, inv_block + '\n' + finanzas_block)
        
        # We also need to add 'Finanzas': false to openMenus state
        content = content.replace("'Inventario': false,", "'Finanzas': false,\n    'Inventario': false,")

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
