import os
import re

path = 'src/app/dashboard/ventas/cotizacion/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

new_button = '''<button onClick={async () => {
                  for (const id of selectedRows) {
                    const numId = parseInt(id.split('-')[1]);
                    await updateSalesOrderStatus(numId, 'TO_INVOICE');
                  }
                  setSelectedRows([]);
                  fetchCotizaciones();
                }} className="flex items-center gap-2 bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                  <CheckSquare size={14} /> Aprobar
                </button>'''

text = re.sub(r'<button className="flex items-center gap-2 bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">\s*<CheckSquare size={14} /> Aprobar\s*</button>', new_button, text)

# Add toast
if "import toast " not in text:
    text = text.replace("import { ResizableHeader", "import toast from 'react-hot-toast';\nimport { ResizableHeader")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Added state transition button to Cotizaciones")
