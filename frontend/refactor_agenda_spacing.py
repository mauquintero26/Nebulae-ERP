import re

with open('src/app/dashboard/agenda/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix Spacing and Padding
content = content.replace('p-8', 'p-5')
content = content.replace('gap-8 overflow-x-auto', 'gap-6 overflow-x-auto')
content = content.replace('gap-6 items-start', 'gap-4 items-start')
content = content.replace('space-y-6', 'space-y-4')
content = content.replace('mb-6', 'mb-4')

# 2. Tabs: ensure all tabs are there
old_tabs_array = "['Información y Bitácora', 'Contactos Adicionales', 'Historial de Compra']"
new_tabs_array = "['Información y Bitácora', 'Contactos Adicionales', 'Historial de Compra', 'Historial de Renting', 'Historial de Prospectación']"
content = content.replace(old_tabs_array, new_tabs_array)

# Add placeholder for the other tabs
new_tabs_content = """
          {activeTab === 'Historial de Renting' && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center min-h-[300px]">
              <p className="text-slate-400 font-bold">Módulo de Renting en construcción...</p>
            </div>
          )}
          {activeTab === 'Historial de Prospectación' && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center min-h-[300px]">
              <p className="text-slate-400 font-bold">Módulo de Prospectación en construcción...</p>
            </div>
          )}
"""
# insert before RIGHT COLUMN
content = content.replace("{/* RIGHT COLUMN: Bitácora de Actividad */}", new_tabs_content + "\n        {/* RIGHT COLUMN: Bitácora de Actividad */}")

with open('src/app/dashboard/agenda/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Basic refactoring applied")
