import os

path = 'src/app/dashboard/marketing/campanas/page.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("Carritos Abandonados (> $100)", "Carritos Abandonados (&gt; $100)")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed JSX error in Campanas")
