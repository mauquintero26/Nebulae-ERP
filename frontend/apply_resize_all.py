import re

files = [
    'src/app/dashboard/ventas/cotizacion/page.tsx',
    'src/app/dashboard/ventas/venta/page.tsx'
]

def replacer(match):
    th_class = match.group(1)
    inner = match.group(2)
    if 'input' in inner or 'checkbox' in inner:
        return match.group(0) # don't touch checkbox column
    
    return f'<th className="{th_class} border-r border-slate-200 hover:bg-slate-100 transition-colors"><div className="resize-x overflow-hidden min-w-[80px] w-auto whitespace-nowrap">{inner}</div></th>'

for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Let's replace the <table> with <table className="w-full text-left table-fixed">
    # Actually wait, in venta: <table className="w-full text-left border-b border-slate-100">
    # Let's just add table-fixed.
    content = content.replace('w-full text-left', 'w-full text-left table-fixed')

    # Find all <th>...</th>
    content = re.sub(r'<th className="([^"]+)">([\s\S]*?)</th>', replacer, content)

    # In tables with table-fixed, cells with lots of text might wrap or overflow. 
    # Let's add truncate to the <td> elements just in case, but let's keep it simple for now.

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Applied native CSS resize-x to Cotizacion and Venta")
