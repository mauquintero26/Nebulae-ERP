import re

path = 'src/components/Sidebar.tsx'

with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Remove Historias from Herramientas
text = text.replace("{ name: 'Historias', path: '/dashboard/historias', icon: Sparkles },", "")

# 2. Update Marketing item
old_marketing = """      { 
        name: 'Marketing', 
        path: '/dashboard/marketing', 
        icon: Megaphone,
      },"""

new_marketing = """      { 
        name: 'Marketing', 
        path: '/dashboard/marketing', 
        icon: Megaphone,
        subItems: [
          { name: '🌐 Flujos (Redes)', path: '/dashboard/marketing/flujos' },
          { name: '📸 Historias & Pubs', path: '/dashboard/marketing/historias' },
          { name: '🎯 Campañas', path: '/dashboard/marketing/campanas' },
          { name: '👥 Visitantes', path: '/dashboard/marketing/visitantes' },
        ]
      },"""

if old_marketing in text:
    text = text.replace(old_marketing, new_marketing)
else:
    # Use regex if exact match fails
    pattern = r"\{\s*name:\s*'Marketing',\s*path:\s*'/dashboard/marketing',\s*icon:\s*Megaphone,?\s*\},"
    text = re.sub(pattern, new_marketing, text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Marketing sidebar updated")
