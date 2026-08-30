import os
import re

files = [
    'src/app/dashboard/marketing/flujos/page.tsx',
    'src/app/dashboard/marketing/historias/page.tsx',
    'src/app/dashboard/marketing/campanas/page.tsx',
    'src/app/dashboard/marketing/visitantes/page.tsx'
]

breadcrumb = """
        <Link href="/dashboard/marketing" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors mb-2">
          <ArrowLeft size={16} /> Volver al Hub de Marketing
        </Link>"""

for file_path in files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Inject imports if not present
    if "import Link from 'next/link';" not in content:
        content = content.replace("import { useState } from 'react';", "import { useState } from 'react';\nimport Link from 'next/link';")
    
    if "ArrowLeft" not in content:
        content = content.replace("} from 'lucide-react';", ", ArrowLeft } from 'lucide-react';")

    # 2. Inject Breadcrumb right above the <h1
    if "Volver al Hub de Marketing" not in content:
        # Some have <div className="flex flex-col sm:flex-row justify-between...
        # and inside <div> <h1...
        content = re.sub(
            r'(<div>\s*<h1)',
            f'<div>{breadcrumb}\n          <h1',
            content
        )

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Breadcrumbs added to all marketing sub-modules.")
