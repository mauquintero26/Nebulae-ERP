import re

with open('src/app/dashboard/agenda/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix Tab Bar wrapping so it's impossible to miss
content = content.replace('flex border-b border-slate-200 mb-4 gap-6 overflow-x-auto custom-scrollbar', 'flex flex-wrap border-b border-slate-200 mb-4 gap-x-6 gap-y-2')

# 2. Update Button Name
content = content.replace('Nuevo Negocio', 'Nueva Solicitud')
content = content.replace("setShowModal('Nuevo Negocio')", "setShowModal('Nueva Solicitud')")

# 3. Replace the basic Modal with a dynamic Modal that renders different content based on the showModal state
# I will use a Regex to replace the entire {/* MODALS */} section.

modal_pattern = r'\{\/\* MODALS \*\/\}[\s\S]*?(?=<\/div>\s*<\/div>\s*\);\s*\})'

new_modals = """{/* MODALS */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-purple-50 to-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-600 text-white rounded-lg shadow-sm">
                  {showModal === 'Agendar' ? <Calendar size={20}/> : showModal === 'Contactar' ? <MessageSquare size={20}/> : <Plus size={20}/>}
                </div>
                <h3 className="font-extrabold text-slate-800 text-lg leading-tight">{showModal}</h3>
              </div>
              <button onClick={() => setShowModal(null)} className="text-slate-400 hover:bg-slate-200 hover:text-slate-700 p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              
              {/* MODAL: AGENDAR */}
              {showModal === 'Agendar' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Fecha de la Reunión</label>
                    <input type="date" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Hora de Disponibilidad</label>
                    <input type="time" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Asunto / Motivo</label>
                    <input type="text" placeholder="Ej. Presentación de producto" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <button onClick={() => { alert('Reunión agendada exitosamente en el calendario.'); setShowModal(null); }} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-purple-700 transition-colors mt-2">
                    Confirmar Agenda
                  </button>
                </div>
              )}

              {/* MODAL: CONTACTAR */}
              {showModal === 'Contactar' && (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-slate-600 mb-2">Selecciona el canal de comunicación:</p>
                  
                  <button onClick={() => { alert('Abriendo chat de WhatsApp'); setShowModal(null); }} className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:bg-green-50 hover:border-green-300 transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600"><MessageSquare size={16} /></div>
                    <span className="font-bold text-slate-700 group-hover:text-green-700">WhatsApp</span>
                  </button>
                  
                  <button onClick={() => { alert('Abriendo chat de Instagram'); setShowModal(null); }} className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:bg-pink-50 hover:border-pink-300 transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-600"><MessageSquare size={16} /></div>
                    <span className="font-bold text-slate-700 group-hover:text-pink-700">Instagram</span>
                  </button>

                  <button onClick={() => { alert('Abriendo chat de Facebook'); setShowModal(null); }} className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><MessageSquare size={16} /></div>
                    <span className="font-bold text-slate-700 group-hover:text-blue-700">Facebook Messenger</span>
                  </button>
                  
                  <button onClick={() => { alert('Abriendo redactor de correo'); setShowModal(null); }} className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:bg-red-50 hover:border-red-300 transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600"><Mail size={16} /></div>
                    <span className="font-bold text-slate-700 group-hover:text-red-700">Correo Electrónico</span>
                  </button>
                  
                  <button onClick={() => { alert('Iniciando llamada...'); setShowModal(null); }} className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:bg-purple-50 hover:border-purple-300 transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600"><Phone size={16} /></div>
                    <span className="font-bold text-slate-700 group-hover:text-purple-700">Llamada Telefónica</span>
                  </button>
                </div>
              )}

              {/* MODAL: NUEVA SOLICITUD */}
              {showModal === 'Nueva Solicitud' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Tipo de Solicitud</label>
                    <div className="relative">
                      <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 appearance-none focus:outline-none focus:border-purple-600">
                        <option>Solicitud de Cotización</option>
                        <option>Solicitud de Seguimiento</option>
                        <option>Solicitud de Devolución / Garantía</option>
                        <option>Solicitud de Soporte Técnico</option>
                      </select>
                      <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Producto o Requerimiento Específico</label>
                    <input type="text" placeholder="Ej. Extractor eléctrico doble..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Detalles Adicionales</label>
                    <textarea rows={3} placeholder="Describe brevemente lo que necesita el cliente..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600 resize-none"></textarea>
                  </div>
                  <button onClick={() => { alert('¡Solicitud Creada! El cliente ha sido ingresado al pipeline del CRM en la etapa correspondiente.'); setShowModal(null); }} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-purple-700 transition-colors mt-2 flex items-center justify-center gap-2">
                    Ingresar al CRM <ArrowRight size={16} />
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
"""

content = re.sub(modal_pattern, new_modals, content)

with open('src/app/dashboard/agenda/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Modals created and wrapping fixed")
