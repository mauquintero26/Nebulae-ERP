import os

path = 'src/app/dashboard/compras/pedidos/page.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "responsable: `Comprador ${num % 3 + 1}`",
    "responsable: `Comprador ${num % 3 + 1}`,\n    pven: num % 3 !== 0 ? `PVEN-${(num + 50).toString().padStart(4, '0')}` : 'Stock Interno'"
)

content = content.replace(
    "<ResizableHeader>ID Pedido</ResizableHeader>",
    "<ResizableHeader>ID Pedido</ResizableHeader>\n                  <ResizableHeader>P. Venta (PVEN)</ResizableHeader>"
)

# Use basic string concatenation or replace directly
target = '<td className="px-6 py-4 font-black text-emerald-600 hover:text-emerald-800 hover:underline"><Link href={`/dashboard/compras/pedidos/${pedido.id.toLowerCase()}`}>{pedido.id}</Link></td>'

td_pven = """
                    <td className="px-6 py-4">
                      {pedido.pven === 'Stock Interno' ? (
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold border border-slate-200">Stock Interno</span>
                      ) : (
                        <Link href={`/dashboard/ventas/venta/${pedido.pven.toLowerCase()}`} className="flex items-center gap-1 font-black text-purple-600 hover:text-purple-800 hover:underline">
                          {pedido.pven}
                        </Link>
                      )}
                    </td>"""

content = content.replace(target, target + "\n" + td_pven)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Added PVEN to Pedidos de Compra table successfully.")
