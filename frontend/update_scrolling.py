import re

files = [
    'src/app/dashboard/ventas/cotizacion/page.tsx',
    'src/app/dashboard/ventas/solicitud/page.tsx'
]

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # The main container currently is:
    # <div className="h-full w-full bg-white flex flex-col px-8 py-6 overflow-y-auto animate-in fade-in custom-scrollbar">
    # We will keep it as the scrollable element.
    
    # The table wrapper currently is:
    # <div className="bg-white flex-1 flex flex-col overflow-hidden">
    # Let's change it to not force flex-1 and not hide overflow
    content = content.replace('className="bg-white flex-1 flex flex-col overflow-hidden"', 'className="bg-white flex flex-col"')
    
    # The table itself has:
    # <div className="flex-1 overflow-y-auto custom-scrollbar">
    # We want the table to just be full height, so no internal scrolling.
    content = content.replace('className="flex-1 overflow-y-auto custom-scrollbar"', 'className="w-full"')
    
    # The table header currently has 'sticky top-0 z-10' which is fine, but maybe we want it sticky relative to the page.
    content = content.replace('sticky top-0 z-10', 'sticky top-0 z-10 bg-white shadow-sm')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print("Updated table scrolling behavior")
