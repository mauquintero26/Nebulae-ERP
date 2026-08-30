import re

path = 'src/app/dashboard/compras/transito/page.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Math.random() with a deterministic calculation based on `num`
content = content.replace(
    "guia: `FX-${Math.floor(Math.random() * 100000000)}`,",
    "guia: `FX-2026${(num * 881).toString().padStart(5, '0')}`,"
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed Hydration Error in Mercancía en Tránsito")
