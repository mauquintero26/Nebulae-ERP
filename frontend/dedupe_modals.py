import re

with open('src/app/dashboard/agenda/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# The modal was duplicated multiple times. I will just find all of them and replace them with a single one at the end.
# Pattern matches from {/* MODAL: OPCIONES DE CLIENTE */} to the end of its block.
pattern = r"\{\/\* MODAL: OPCIONES DE CLIENTE \*\/\}[\s\S]*?(?=\{\/\* MODAL|\<\/div>\s*\<\/div>\s*\<\/div>\s*\)\}$)"

# Actually, it's easier to just strip them all out completely, then insert one at the correct spot.
clean_content = re.sub(r"\{\/\* MODAL: OPCIONES DE CLIENTE \*\/\}[\s\S]*?\{\/\* End of Opciones \*\/\}", "", content) # Wait, I didn't add "End of Opciones"

# Let's use a very specific regex to remove them all
remove_pattern = r"\{\/\* MODAL: OPCIONES DE CLIENTE \*\/\}[\s\S]*?Eliminar Cliente[\s\S]*?<\/p>\s*<\/div>\s*<\/button>\s*<\/div>\s*<\/div>\s*\)\}"
clean_content = re.sub(remove_pattern, "", content)

# Now, insert exactly one at the very end of the modals block.
opciones_modal = """
              {/* MODAL: OPCIONES DE CLIENTE */}
              {showModal === 'Opciones de Cliente' && (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-slate-600 mb-4 text-center">Configuración y gestión de datos de este cliente:</p>
                  
                  <button onClick={() => { setActiveTab('Información y Bitácora'); setShowModal(null); }} className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition-colors group shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><Edit size={18} /></div>
                    <div className="text-left">
                      <h4 className="font-bold text-slate-800 group-hover:text-blue-700">Modificar Cliente</h4>
                      <p className="text-xs text-slate-500">Actualiza la información básica y etiquetas.</p>
                    </div>
                  </button>
                  
                  <button onClick={() => { alert('Iniciando descarga de reporte en PDF/Excel...'); setShowModal(null); }} className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-300 transition-colors group shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><Download size={18} /></div>
                    <div className="text-left">
                      <h4 className="font-bold text-slate-800 group-hover:text-emerald-700">Exportar Información</h4>
                      <p className="text-xs text-slate-500">Descarga su historial, compras y bitácora.</p>
                    </div>
                  </button>

                  <div className="pt-4 mt-4 border-t border-slate-100">
                    <button onClick={() => { if(confirm('¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer.')) { alert('Cliente eliminado.'); setShowModal(null); setSelectedClient(null); } }} className="w-full flex items-center gap-3 p-4 border border-red-100 rounded-xl hover:bg-red-50 hover:border-red-300 transition-colors group shadow-sm bg-red-50/50">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600"><Trash2 size={18} /></div>
                      <div className="text-left">
                        <h4 className="font-bold text-red-700">Eliminar Cliente</h4>
                        <p className="text-xs text-red-500">Borrar permanentemente su ficha del CRM.</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}"""

# Replace the last occurrence of the modal block end to inject it
last_block_pattern = r"(Ingresar al CRM <ArrowRight size=\{16\} \/>\s*<\/button>\s*<\/div>\s*\)\})"
clean_content = re.sub(last_block_pattern, r"\1" + opciones_modal, clean_content)

with open('src/app/dashboard/agenda/page.tsx', 'w', encoding='utf-8') as f:
    f.write(clean_content)
print("Removed duplicates")
