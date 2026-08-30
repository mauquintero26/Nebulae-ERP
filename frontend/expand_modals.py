import re

with open('src/app/dashboard/agenda/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Make Settings button open the new modal
content = content.replace(
    '<button className="bg-white border border-slate-200 p-2.5 rounded-lg text-slate-500 hover:bg-slate-50 shadow-sm"><Settings size={18} /></button>',
    '<button onClick={() => setShowModal(\'Opciones de Cliente\')} className="bg-white border border-slate-200 p-2.5 rounded-lg text-slate-500 hover:bg-slate-50 shadow-sm"><Settings size={18} /></button>'
)

# 2. Add lucide icons for the new modal (Edit, Trash2, Download)
# Let's just make sure they are imported, if not, I'll just use text or generic icons that are already imported like Settings, FileText, etc.
# Wait, I can inject them in the imports safely.
import_pattern = r'import \{([\s\S]*?)\} from \'lucide-react\';'
def add_icons(match):
    imports = match.group(1)
    if 'Trash2' not in imports:
        imports += ", Trash2, Edit, Download"
    return f"import {{{imports}}} from 'lucide-react';"
content = re.sub(import_pattern, add_icons, content)

# 3. Modify the 'Agendar' modal to include a visual calendar grid
agendar_modal_pattern = r'\{\/\* MODAL: AGENDAR \*\/\}[\s\S]*?(?=\{\/\* MODAL: CONTACTAR \*\/\})'

new_agendar_modal = """{/* MODAL: AGENDAR */}
              {showModal === 'Agendar' && (
                <div className="space-y-4">
                  
                  {/* Mock Visual Calendar */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 p-4">
                    <div className="flex justify-between items-center mb-4">
                      <button className="text-slate-400 hover:text-purple-600"><ChevronLeft size={18}/></button>
                      <h4 className="font-bold text-slate-700 text-sm">Septiembre 2026</h4>
                      <button className="text-slate-400 hover:text-purple-600"><ChevronLeft size={18} className="rotate-180"/></button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                      {['Lu','Ma','Mi','Ju','Vi','Sá','Do'].map(d => (
                        <div key={d} className="text-[10px] font-bold text-slate-400">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: 30 }).map((_, i) => (
                        <button key={i} className={`p-1.5 text-xs font-medium rounded-lg transition-colors ${i === 14 ? 'bg-purple-600 text-white shadow-md' : i < 10 ? 'text-slate-300 line-through' : 'text-slate-700 hover:bg-purple-100'}`}>
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Fecha (Manual)</label>
                      <input type="date" defaultValue="2026-09-15" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Disponibilidad</label>
                      <input type="time" defaultValue="10:00" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Asunto / Motivo</label>
                    <input type="text" placeholder="Ej. Presentación de producto" className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <button onClick={() => { alert('Reunión agendada exitosamente en el calendario.'); setShowModal(null); }} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-purple-700 transition-colors mt-2">
                    Confirmar Agenda
                  </button>
                </div>
              )}

              """

content = re.sub(agendar_modal_pattern, new_agendar_modal, content)

# 4. Add the Opciones de Cliente Modal right before the closing </div> of the modals container
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
              )}
"""

# Insert right before the last closing tags of the modal structure
# Look for: {showModal === 'Nueva Solicitud' && (...)}
content = content.replace("</button>\n                </div>\n              )}", "</button>\n                </div>\n              )}\n" + opciones_modal)


# Also need to fix the modal header icon to handle 'Opciones de Cliente'
icon_logic_pattern = r"\{showModal === 'Agendar' \? <Calendar size=\{20\}\/> : showModal === 'Contactar' \? <MessageSquare size=\{20\}\/> : <Plus size=\{20\}\/>\}"
new_icon_logic = "{showModal === 'Agendar' ? <Calendar size={20}/> : showModal === 'Contactar' ? <MessageSquare size={20}/> : showModal === 'Opciones de Cliente' ? <Settings size={20}/> : <Plus size={20}/>}"
content = content.replace(icon_logic_pattern, new_icon_logic)

with open('src/app/dashboard/agenda/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Modals expanded successfully")
