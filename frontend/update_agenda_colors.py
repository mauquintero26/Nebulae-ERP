import re

with open('src/app/dashboard/agenda/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Colors to Nebulae Palette
# "#1a3822" (Dark green titles) -> "slate-900"
content = content.replace('text-[#1a3822]', 'text-slate-900')
content = content.replace('border-[#1a3822]', 'border-purple-600')

# "#2a4d33" (Main green buttons/highlights) -> "purple-600"
content = content.replace('bg-[#2a4d33]', 'bg-purple-600')
content = content.replace('hover:bg-[#1a3822]', 'hover:bg-purple-700')
content = content.replace('text-[#2a4d33]', 'text-purple-600')
content = content.replace('focus:border-[#2a4d33]', 'focus:border-purple-600')
content = content.replace('focus:ring-[#2a4d33]', 'focus:ring-purple-600')

# 2. Remove "Nuevas Asignaciones"
nuevas_asignaciones_pattern = r'<button className="px-4 py-2 font-bold text-sm text-slate-500 flex items-center gap-2">\s*Nuevas Asignaciones <span[^>]*>3<\/span>\s*<\/button>'
content = re.sub(nuevas_asignaciones_pattern, '', content)

# 3. Change active tab border color to purple
content = content.replace('border-b-2 border-slate-900 text-slate-900', 'border-b-2 border-purple-600 text-purple-700')

# For the list active tab "Todos mis clientes":
content = content.replace('border-b-2 border-purple-600 text-slate-900', 'border-b-2 border-purple-600 text-purple-700')

with open('src/app/dashboard/agenda/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Colors updated to Nebulae palette")
