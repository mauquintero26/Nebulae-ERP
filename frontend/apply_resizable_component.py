import re

files = [
    'src/app/dashboard/ventas/solicitud/page.tsx',
    'src/app/dashboard/ventas/cotizacion/page.tsx',
    'src/app/dashboard/ventas/venta/page.tsx'
]

# We want to import ResizableHeader at the top
import_statement = "import { ResizableHeader } from '@/components/ResizableHeader';\n"

for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Add import if not exists
    if 'ResizableHeader' not in content:
        content = content.replace("import { useState } from 'react';", "import { useState } from 'react';\n" + import_statement)

    # In the previous step, I did this:
    # <th className="px-6 py-4 font-bold border-r border-slate-200 hover:bg-slate-100 transition-colors"><div className="resize-x overflow-hidden min-w-[80px] w-auto whitespace-nowrap">Cliente</div></th>
    # Let's replace it with:
    # <ResizableHeader>Cliente</ResizableHeader>

    def replacer(match):
        th_class = match.group(1)
        inner = match.group(2)
        
        # If it's the checkbox column
        if 'input' in inner or 'checkbox' in inner:
            return match.group(0)
            
        # Extract the pure text from inside the div
        # inner looks like: <div className="resize-x ...">Text</div>
        text_match = re.search(r'>([^<]+)</div>', inner)
        if text_match:
            pure_text = text_match.group(1)
        else:
            pure_text = inner.strip()

        return f'<ResizableHeader>{pure_text}</ResizableHeader>'

    # Match all <th> elements
    content = re.sub(r'<th className="([^"]+)">([\s\S]*?)</th>', replacer, content)

    # We also changed the table to 'table-fixed' in the last step.
    # If the user sets widths, table-fixed is good, but let's keep table-fixed if it's there.
    # Actually, if we use width: 100px on a th, table-fixed will respect it.
    # But table-fixed requires that ALL th have widths or they distribute evenly.
    # If they distribute evenly initially, it's fine.
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Applied ResizableHeader to all tables")
