import re

# 1. Rename in Sidebar
sidebar_path = 'src/components/Sidebar.tsx'
with open(sidebar_path, 'r', encoding='utf-8') as f:
    sidebar_content = f.read()

sidebar_content = sidebar_content.replace(
    "{ name: 'Venta', path: '/dashboard/ventas/venta' }",
    "{ name: 'Pedido de Venta', path: '/dashboard/ventas/venta' }"
)
with open(sidebar_path, 'w', encoding='utf-8') as f:
    f.write(sidebar_content)


# 2. Rename in Ventas Hub / page.tsx
venta_path = 'src/app/dashboard/ventas/venta/page.tsx'
with open(venta_path, 'r', encoding='utf-8') as f:
    venta_content = f.read()

venta_content = venta_content.replace(
    '<h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">\n            Hub de Ventas\n          </h1>',
    '<h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">\n            Pedidos de Venta\n          </h1>'
)
venta_content = venta_content.replace(
    'Gestiona y centraliza todas las ventas provenientes',
    'Gestiona todos los pedidos de venta provenientes'
)
venta_content = venta_content.replace(
    'Ventas seleccionadas',
    'Pedidos seleccionados'
)
# Add Link to the IDs if they aren't already Links
# In venta/page.tsx: <td className="px-6 py-4 font-black text-slate-800">{venta.id}</td>
if 'import Link from "next/link";' not in venta_content and "import Link from 'next/link';" not in venta_content:
    venta_content = venta_content.replace("import { useState } from 'react';", "import { useState } from 'react';\nimport Link from 'next/link';")

venta_content = re.sub(
    r'<td className="px-6 py-4 font-black text-slate-800">\{venta\.id\}</td>',
    r'<td className="px-6 py-4 font-black text-emerald-600 hover:text-emerald-800 hover:underline"><Link href={`/dashboard/ventas/venta/${venta.id.toLowerCase()}`}>{venta.id}</Link></td>',
    venta_content
)

with open(venta_path, 'w', encoding='utf-8') as f:
    f.write(venta_content)

print("Renamed to Pedido de Venta and linked IDs")
