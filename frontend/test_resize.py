import re

path = 'src/app/dashboard/ventas/solicitud/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Let's replace the <table> with <table className="w-full text-left table-fixed">
content = content.replace('<table className="w-full text-left">', '<table className="w-full text-left table-fixed">')

# We'll replace the text inside <th> (excluding the checkbox one) with a resizable div.
# Currently: <th className="px-6 py-4 font-bold">Cliente</th>
# We want: <th className="px-6 py-4 font-bold border-r border-slate-200"><div className="resize-x overflow-hidden w-full min-w-[50px]">Cliente</div></th>

def replacer(match):
    th_class = match.group(1)
    inner = match.group(2)
    if 'input' in inner or 'checkbox' in inner:
        return match.group(0) # don't touch checkbox column
    
    return f'<th className="{th_class} border-r border-slate-200 hover:bg-slate-100 transition-colors"><div className="resize-x overflow-hidden min-w-[80px] w-auto whitespace-nowrap">{inner}</div></th>'

# Find all <th>...</th>
content = re.sub(r'<th className="([^"]+)">([\s\S]*?)</th>', replacer, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied native CSS resize-x to Solicitud")
