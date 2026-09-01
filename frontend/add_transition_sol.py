import os
import re

path = 'src/app/dashboard/ventas/solicitud/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the button for Marcar Resueltas
new_button = '''<button onClick={async () => {
                for (const id of selectedRows) {
                  const numId = parseInt(id.split('-')[1]);
                  await updateSalesOrderStatus(numId, 'QUOTATION');
                }
                toast.success('Solicitudes pasadas a Cotización');
                setSelectedRows([]);
                fetchSolicitudes();
              }} className="flex items-center gap-2 bg-white border border-purple-200 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                <CheckSquare size={14} /> Enviar a Cotizar
              </button>'''

text = re.sub(r'<button className="flex items-center gap-2 bg-white border border-purple-200 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">\s*<CheckSquare size={14} /> Marcar Resueltas\s*</button>', new_button, text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Added state transition button to Solicitud")
