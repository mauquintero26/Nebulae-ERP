import re

path = 'src/app/dashboard/ventas/cotizacion/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure Link is imported
if 'import Link from "next/link";' not in content and "import Link from 'next/link';" not in content:
    content = content.replace("import { useState } from 'react';", "import { useState } from 'react';\nimport Link from 'next/link';")

# Change the ID rendering to a Link
# from: <td className="px-6 py-4 font-black text-slate-800">{cot.id}</td>
# to:   <td className="px-6 py-4 font-black text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"><Link href={`/dashboard/ventas/cotizacion/${cot.id.toLowerCase()}`}>{cot.id}</Link></td>
content = content.replace(
    '<td className="px-6 py-4 font-black text-slate-800">{cot.id}</td>',
    '<td className="px-6 py-4 font-black text-blue-600 hover:text-blue-800 hover:underline"><Link href={`/dashboard/ventas/cotizacion/${cot.id.toLowerCase()}`}>{cot.id}</Link></td>'
)

# And update the "Nueva Cotización" button to be a Link to /dashboard/ventas/cotizacion/nueva
content = content.replace(
    '<button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">',
    '<Link href="/dashboard/ventas/cotizacion/nueva" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">'
)
content = content.replace(
    '<Plus size={18} /> Nueva Cotización\n        </button>',
    '<Plus size={18} /> Nueva Cotización\n        </Link>'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Added Links to Cotizacion page")
