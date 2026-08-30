import re

with open('src/app/dashboard/agenda/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove Renting and Prospectación from Tabs Array
old_tabs_array = "['Información y Bitácora', 'Contactos Adicionales', 'Historial de Compra', 'Historial de Renting', 'Historial de Prospectación']"
new_tabs_array = "['Información y Bitácora', 'Contactos Adicionales', 'Historial de Compra']"
content = content.replace(old_tabs_array, new_tabs_array)

# Remove their content blocks
renting_block = r"\{\/\* Historial de Renting \*\/\}[\s\S]*?\{\/\* Historial de Prospectación \*\/\}[\s\S]*?\}"
content = re.sub(r"\{\s*activeTab === 'Historial de Renting'[\s\S]*?Módulo de Prospectación en construcción\.\.\.<\/p>\s*<\/div>\s*\)\s*\}", "", content)

# 2. Logic for "Nuevo Cliente"
# When isNew is true, we ONLY show the "Información y Bitácora" form, NO tabs.
tabs_render = r"\{\/\* Tabs \*\/\}\s*<div className=\"flex flex-wrap border-b border-slate-200 mb-4 gap-x-6 gap-y-2\">[\s\S]*?<\/div>"
new_tabs_render = """{/* Tabs */}
      {!isNew && (
        <div className="flex flex-wrap border-b border-slate-200 mb-4 gap-x-6 gap-y-2">
          {['Información y Bitácora', 'Contactos Adicionales', 'Historial de Compra'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}"""
content = re.sub(tabs_render, new_tabs_render, content)


# 3. Logic for Right Column (Bitácora) visibility
# The Bitácora only shows if activeTab === 'Información y Bitácora' AND it's NOT a new client.
# Wait, for new client they also said "Solo necesito la informacion para colectar y crear un nuevo cliente". So no Bitácora on NEW.
# And for "Contactos Adicionales" and "Historial de Compra", no Bitácora.
# So Bitácora ONLY shows when activeTab === 'Información y Bitácora' && !isNew.

right_col_pattern = r"\{\/\* RIGHT COLUMN: Bitácora de Actividad \*\/\}[\s\S]*?(?=\{\/\* MODALS \*\/\}|<\/div>\s*<\/div>\s*\{\/\* MODALS \*\/\}|<\/div>\s*<\/div>\s*<\/div>\s*\{\/\* MODALS \*\/\}|<\/div>\s*<\/div>\s*\{\/\* MODALS \*\/\}|<\/div>\s*<\/div>\s*<\/div>)"

# Note: Using python string manipulation might be safer to replace the RIGHT COLUMN if regex is too greedy.
# Let's extract the part exactly.
# I'll just write a script that reconstructs the return statement for VIEW 2 to be completely safe.
