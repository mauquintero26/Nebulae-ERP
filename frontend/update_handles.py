import re

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Column 2 handle
content = content.replace(
    'className="absolute right-0 top-0 bottom-0 w-1.5 hover:bg-purple-400 hover:w-2 cursor-col-resize transition-all bg-slate-200/50 z-20"',
    'className="absolute right-0 top-0 bottom-0 w-1.5 hover:bg-purple-400/50 hover:w-2 cursor-col-resize transition-all bg-transparent z-20"'
)

# 2. Update Column 4 vertical handle (already bg-transparent, just lower hover opacity to be safe)
content = content.replace(
    'className="absolute left-0 top-0 bottom-0 w-1.5 hover:bg-purple-400 hover:w-2 cursor-col-resize transition-all bg-transparent z-20 -ml-[1px]"',
    'className="absolute left-0 top-0 bottom-0 w-1.5 hover:bg-purple-400/50 hover:w-2 cursor-col-resize transition-all bg-transparent z-20 -ml-[1px]"'
)

# 3. Update horizontal handle
content = content.replace(
    'className="h-1.5 w-full bg-slate-200 cursor-row-resize hover:bg-purple-400 hover:h-2 transition-all absolute bottom-0 left-0 right-0 z-20"',
    'className="h-1.5 w-full bg-transparent cursor-row-resize hover:bg-purple-400/50 hover:h-2 transition-all absolute bottom-0 left-0 right-0 z-20 -mb-[1px]"'
)

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Handles updated")
