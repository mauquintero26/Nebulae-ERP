import re

with open('src/app/dashboard/calendario/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update padding and gaps for "finura"
content = content.replace('p-8', 'p-5')
content = content.replace('gap-6 items-start', 'gap-4 items-stretch flex-1 min-h-0 mb-4')
content = content.replace('w-80 space-y-6 flex-shrink-0', 'w-80 flex flex-col gap-4 flex-shrink-0 h-full')

# 2. Make the right column responsive and remove hardcoded 800px height
content = content.replace('h-[800px]', 'h-full')

# 3. Make the "Próximos Eventos" box flex-1 so it stretches down to align perfectly with the calendar grid
# Currently it is:
# <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5">
#   <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">Próximos Eventos</h3>
# We need to replace the first line, but be careful not to match the other boxes.
# The other boxes have p-5 (Sync) and p-6 (Mini Calendar).
# Let's just find the Próximos Eventos block.

proximos_pattern = r'<div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5">\s*<h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">Próximos Eventos<\/h3>'
new_proximos = """<div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 flex-1 flex flex-col min-h-0">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4 flex-shrink-0">Próximos Eventos</h3>"""
content = re.sub(proximos_pattern, new_proximos, content)

# And make its inner container scrollable if needed
inner_events_pattern = r'<div className="space-y-4">\s*\{MOCK_EVENTS\.map'
new_inner_events = """<div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
              {MOCK_EVENTS.map"""
content = re.sub(inner_events_pattern, new_inner_events, content)


# 4. Change mini-calendar padding from p-6 to p-5 for consistency
content = content.replace('p-6', 'p-5')


with open('src/app/dashboard/calendario/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Calendar layout adjusted")
