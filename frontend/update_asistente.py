import re

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Change inboxWidth default from 320 to 240
content = re.sub(r'const \[inboxWidth, setInboxWidth\] = useState\(320\);', 'const [inboxWidth, setInboxWidth] = useState(240);', content)

# 2. Make CRM column flex-1 and same size as Chat column by removing the inline style `width: crmWidth`
# Replace:
#       {/* COLUMN 4: CRM + AI COPILOT */}
#       <div 
#         className="bg-white border-l border-slate-200 flex flex-col flex-shrink-0 relative overflow-hidden"
#         style={{ width: crmWidth, resize: 'horizontal', direction: 'rtl', minWidth: '300px', maxWidth: '600px' }}
#       >
#         <div style={{ direction: 'ltr' }} className="h-full flex flex-col">
old_col4 = r"\{\/\* COLUMN 4: CRM \+ AI COPILOT \*\/}[\s\S]*?<div style=\{\{ direction: 'ltr' \}\} className=\"h-full flex flex-col\">"
new_col4 = """      {/* COLUMN 4: CRM + AI COPILOT */}
      <div className="flex-1 bg-white border-l border-slate-200 flex flex-col relative overflow-hidden min-w-[300px]">
        <div className="h-full flex flex-col">"""
content = re.sub(old_col4, new_col4, content)

# Also remove the `crmWidth` state if it's there
content = re.sub(r'const \[crmWidth, setCrmWidth\] = useState\(380\);\n', '', content)

# 3. CRM 360 PROFILE Updates
# We need to replace the Cabecera del Perfil.
old_cabecera = r"\{\/\* Cabecera del Perfil \*\/\}[\s\S]*?\{\/\* Órdenes \/ Embudos \*\/\}"
new_cabecera = """{/* Cabecera del Perfil */}
            <div className="flex flex-col gap-4 mb-6 pb-6 border-b border-slate-100">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-black text-lg shadow-md">
                    MF
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 leading-none mb-1">María Fernanda</h2>
                    <div className="flex gap-4 text-xs font-medium text-slate-600 mt-2">
                      <div className="flex items-center gap-1.5"><Phone size={14} className="text-slate-400"/> +57 300 123 4567</div>
                      <div className="flex items-center gap-1.5"><Mail size={14} className="text-slate-400"/> mfernanda@email.com</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 mt-2">
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">LTV (Total)</span>
                  <span className="text-sm font-black">$1.450.000</span>
                </div>
                <button 
                  onClick={() => setShowPurchasesModal(true)}
                  className="flex-1 text-center text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:border-purple-300 hover:bg-purple-50 px-3 py-2 rounded-lg shadow-sm transition-colors"
                >
                  Historial de Compras
                </button>
              </div>
            </div>

            {/* Órdenes / Embudos */}"""
content = re.sub(old_cabecera, new_cabecera, content)

# 4. Agent Section (Copilot) - Add New Buttons and remove old LTV/Historial
old_copilot_kpis = r"\{\/\* Customer KPIs \*\/\}[\s\S]*?\{\/\* Quick Actions \*\/\}"
new_copilot_kpis = """{/* Customer KPIs */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button className="col-span-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-3 rounded-xl shadow-md hover:shadow-lg transition-all flex justify-center items-center gap-2 font-bold text-sm">
                  + Nueva Venta
                </button>
                <button className="col-span-2 bg-white text-indigo-600 border border-indigo-200 p-3 rounded-xl shadow-sm hover:bg-indigo-50 transition-all flex justify-center items-center gap-2 font-bold text-sm">
                  <ShoppingCart size={16} />
                  Subir última venta automáticamente
                </button>
              </div>

              {/* Quick Actions */}"""

# If Quick Actions isn't there, we just replace the grid grid-cols-2 gap-2 section.
old_copilot_grid = r"\{\/\* Customer KPIs \*\/\}[\s\S]*?<\/div>\s*<\/div>\s*\{\/\* Chat Input \*\/}"
new_copilot_grid = """{/* Customer KPIs */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button className="col-span-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-3 rounded-xl shadow-md hover:shadow-lg transition-all flex justify-center items-center gap-2 font-bold text-sm">
                  + Nueva Venta
                </button>
                <button className="col-span-2 bg-white text-indigo-600 border border-indigo-200 p-3 rounded-xl shadow-sm hover:bg-indigo-50 transition-all flex justify-center items-center gap-2 font-bold text-sm">
                  <ShoppingCart size={16} />
                  Subir última venta automáticamente
                </button>
              </div>
            </div>

            {/* Chat Input */}"""
content = re.sub(old_copilot_grid, new_copilot_grid, content)

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done!")
