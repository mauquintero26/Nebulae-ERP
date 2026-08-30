import re

path = 'src/app/dashboard/ventas/solicitud/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure Link is imported
if 'import Link from "next/link";' not in content and "import Link from 'next/link';" not in content:
    content = content.replace("import { useState } from 'react';", "import { useState } from 'react';\nimport Link from 'next/link';")

# Change the ID rendering to a Link
# from: <td className="px-6 py-4 font-black text-slate-800">{sol.id}</td>
# to:   <td className="px-6 py-4 font-black text-purple-600 hover:text-purple-800 hover:underline cursor-pointer"><Link href={`/dashboard/ventas/solicitud/${sol.id.toLowerCase()}`}>{sol.id}</Link></td>
content = content.replace(
    '<td className="px-6 py-4 font-black text-slate-800">{sol.id}</td>',
    '<td className="px-6 py-4 font-black text-purple-600 hover:text-purple-800 hover:underline"><Link href={`/dashboard/ventas/solicitud/${sol.id.toLowerCase()}`}>{sol.id}</Link></td>'
)

# And update the "Nueva Solicitud" button to be a Link to /dashboard/ventas/solicitud/nueva
content = content.replace(
    '<button className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">',
    '<Link href="/dashboard/ventas/solicitud/nueva" className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">'
)
content = content.replace(
    '<Plus size={18} /> Nueva Solicitud\n        </button>',
    '<Plus size={18} /> Nueva Solicitud\n        </Link>'
)


with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Added Links to Solicitud page")
