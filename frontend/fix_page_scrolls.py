import re
import glob

files = [
    'src/app/dashboard/ventas/venta/page.tsx',
    'src/app/dashboard/ventas/cotizacion/page.tsx',
    'src/app/dashboard/ventas/solicitud/page.tsx'
]

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # The root div should just be a flex container that stretches as tall as its content.
    # Replace the starting div class:
    # Solicitud/Cotizacion has: h-full w-full bg-white flex flex-col px-8 py-6 overflow-y-auto animate-in fade-in custom-scrollbar
    # Venta has: w-full bg-white flex flex-col px-8 py-6 animate-in fade-in
    
    # We'll use a regex to replace the root div class
    content = re.sub(
        r'<div className="[^"]*?bg-white[^"]*?flex flex-col[^"]*?px-8 py-6[^"]*?">',
        '<div className="w-full bg-white flex flex-col px-8 py-6 min-h-max">',
        content,
        count=1
    )
    
    # Also the user requested "Muestra las 24 primeras ventas". I generated 25 earlier. 
    # Let's change the lengths in Venta to 24, and the paginator text to 24.
    content = re.sub(r'Array\.from\(\{ length: 25 \}', 'Array.from({ length: 24 }', content)
    content = content.replace('Mostrando 1 a 25', 'Mostrando 1 a 24')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print("Fixed layout scroll and set items to 24")
