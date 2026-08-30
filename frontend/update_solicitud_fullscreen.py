import re

with open('src/app/dashboard/ventas/solicitud/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Generate 25 items
mock_items = "[\n"
tipos = ['Cotización', 'Soporte', 'Información', 'Devolución', 'Queja']
for i in range(1, 26):
    is_desatendida = i in [2, 7, 15]
    estado = "Nuevo" if i % 4 == 0 else ("En Proceso" if i % 2 == 0 else "Esperando Cliente")
    mock_items += f"  {{ id: 'SC-{i:04d}', cliente: 'Cliente Genérico {i}', tipo: '{tipos[i%5]}', estado: '{estado}', ultimaAct: '{'Hace 4 días' if is_desatendida else 'Hace 1 hora'}', responsable: 'Agente {i%4 + 1}', desatendida: {'true' if is_desatendida else 'false'} }},\n"
mock_items += "]"

# Replace mock array
content = re.sub(r'const MOCK_SOLICITUDES = \[\s*[\s\S]*?\s*\];', f'const MOCK_SOLICITUDES = {mock_items};', content)

# Change background to white and remove padding to make it full screen edge-to-edge
content = content.replace('bg-[#f8f9fa] flex flex-col p-5', 'bg-white flex flex-col px-8 py-6')

# Remove the rounded box from search bar
content = content.replace('bg-white p-3 rounded-t-3xl shadow-sm border border-slate-200 border-b-0', 'bg-white py-3 border-b border-slate-100')

# Remove the rounded box from the table wrapper
content = content.replace('bg-white rounded-b-3xl shadow-sm border border-slate-200 flex-1', 'bg-white flex-1')

# Add pagination before the final closing divs
pagination_html = """
        {/* Paginación */}
        {activeView === 'list' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
            <span className="text-sm text-slate-500">Mostrando 1 a 25 de 48 solicitudes</span>
            <div className="flex items-center gap-1">
              <button className="px-3 py-1 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors">Anterior</button>
              <button className="w-8 h-8 rounded-lg bg-purple-600 text-white text-sm font-bold shadow-sm">1</button>
              <button className="w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">2</button>
              <span className="text-slate-400 px-2">...</span>
              <button className="px-3 py-1 text-sm font-medium text-purple-600 hover:text-purple-800 transition-colors">Siguiente</button>
            </div>
          </div>
        )}
"""

content = content.replace('{/* Placeholder para otras vistas */}', pagination_html + '\n        {/* Placeholder para otras vistas */}')

with open('src/app/dashboard/ventas/solicitud/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Solicitudes updated to full screen and 25 items with pagination")
