import os
import re

path = 'src/app/dashboard/ventas/venta/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Filter change
text = text.replace("const ventas = realSales.filter(s => s.status === 'INVOICED').map(s => ({", "const ventas = realSales.filter(s => s.status === 'INVOICED' || s.status === 'TO_INVOICE').map(s => ({")

# Status label mapping
text = text.replace("estado: 'Pagado',", "estado: s.status === 'TO_INVOICE' ? 'Pendiente de Pago' : 'Pagado',")

new_button = '''<button onClick={async () => {
                  for (const id of selectedRows) {
                    const numId = parseInt(id.split('-')[1]);
                    await invoiceSalesOrder(numId);
                  }
                  setSelectedRows([]);
                  fetchVentas();
                }} className="flex items-center gap-2 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                  <FileText size={14} /> Facturar en Bloque
                </button>'''

text = re.sub(r'<button className="flex items-center gap-2 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">\s*<FileText size={14} /> Facturar en Bloque\s*</button>', new_button, text)

# Add toast
if "import toast " not in text:
    text = text.replace("import { ResizableHeader", "import toast from 'react-hot-toast';\nimport { ResizableHeader")


with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Added state transition button to Ventas (Facturar)")
