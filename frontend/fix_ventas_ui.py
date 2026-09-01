import os

path = 'src/app/dashboard/ventas/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Remove Alerta de Sistema (Atasco)
import re
text = re.sub(r'\{/\* 2\. ALERTA CRÍTICA \(Dinámica\) \*/\}.*?\{/\* 3\. KPIs y Métricas \*/\}', '{/* 3. KPIs y Metricas */}', text, flags=re.DOTALL)

# 2. Rename Tasa de Conversion to Margen Promedio & zero out fake KPIs (since we fetch from DB)
text = text.replace('Tasa de Conversin', 'Margen Promedio')
text = text.replace('Tasa de Conversión', 'Margen Promedio')
text = text.replace('32.4%', '0%') # Default value
text = text.replace('12', '{salesData.filter(s => s.status === \'Pendiente\').length}') # Cotizaciones atascadas -> conteo real
text = text.replace('$60,400', '${salesData.filter(s => s.status === \'Pendiente\').reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}') # Pendiente Facturar
text = text.replace('En 8 Pedidos de Venta aprobados', '{salesData.filter(s => s.status === \'Pendiente\').length} Pedidos de Venta aprobados')
text = text.replace('$142,000', '${salesData.filter(s => s.status === \'Facturado\').reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}')

# 3. Fix button "Nueva Venta Directa"
text = text.replace('<button className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md flex items-center gap-2 hover:-translate-y-0.5">', '<Link href="/dashboard/ventas/solicitud" className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md flex items-center gap-2 hover:-translate-y-0.5">')
text = text.replace('Nueva Venta Directa\n          </button>', 'Nueva Venta Directa\n          </Link>')

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed Ventas UI requested items")
