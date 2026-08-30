import re

with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure Calendar is imported if needed, but we already have some icons.
if 'CalendarDays' not in content:
    content = content.replace("LayoutDashboard, Users,", "LayoutDashboard, Users, CalendarDays,")

# Find the Agenda de Clientes item and insert Calendario right after it
agenda_item = "{ name: 'Agenda de Clientes', path: '/dashboard/agenda', icon: Users },"
calendario_item = "{ name: 'Calendario', path: '/dashboard/calendario', icon: CalendarDays },"

content = content.replace(agenda_item, agenda_item + "\n      " + calendario_item)

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Sidebar updated with Calendario")
