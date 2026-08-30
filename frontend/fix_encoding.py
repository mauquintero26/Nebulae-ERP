import re

path = 'src/app/dashboard/ventas/cotizacion/page.tsx'
with open(path, 'rb') as f:
    content = f.read()

# Replace invalid bytes with correct UTF-8
# Wait, it's easier to just do it via powershell or python decode replace.
try:
    text = content.decode('utf-8')
except Exception as e:
    print(f"Decoding failed: {e}")
    text = content.decode('utf-8', errors='replace')

text = text.replace('Cotizacin', 'Cotización')
text = text.replace('Crticas', 'Críticas')
text = text.replace('das', 'días')
text = text.replace('Gestin', 'Gestión')
text = text.replace('ltima Act.', 'Última Act.')
text = text.replace('Emisin', 'Emisión')

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed encoding issues")
