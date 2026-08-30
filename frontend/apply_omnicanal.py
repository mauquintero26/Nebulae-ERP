import re

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """          {/* TOP: CRM 360 PROFILE */}
          <div className="flex-1 overflow-y-auto p-5 border-b border-slate-200 bg-white relative">
            
            {/* Buscador de Enlace */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Enlazar con cliente existente (Busca Cédula/Nombre)..." 
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-purple-500/20 outline-none transition-shadow placeholder:text-slate-400"
              />
            </div>

            {/* Cabecera del Perfil */}
            <div className="flex flex-col gap-4 mb-6 pb-6 border-b border-slate-100">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-black text-lg shadow-md">
                    MF
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 leading-none mb-1">María Fernanda</h2>
                    <p className="text-xs text-slate-500 font-medium">Cliente Frecuente (LTV: $475k)</p>
                  </div>
                </div>
                <button className="flex items-center gap-1 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-lg shadow-sm shadow-purple-200 transition-colors">
                  + Nueva Compra
                </button>
              </div>
              <div className="flex gap-4 text-xs font-medium text-slate-600">
                <div className="flex items-center gap-1.5"><Phone size={14} className="text-slate-400"/> +57 300 123 4567</div>
                <div className="flex items-center gap-1.5"><Mail size={14} className="text-slate-400"/> mfernanda@email.com</div>
              </div>
            </div>

            {/* Órdenes / Embudos */}
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              Órdenes Activas <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px]">2</span>
            </h3>

            <div className="space-y-3">
              {/* Orden 1 (Accordion Card) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm hover:border-purple-300 transition-colors cursor-pointer group">
                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center group-hover:bg-purple-50/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900">Orden #002</span>
                    <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md uppercase tracking-wider">Pendiente de Pago</span>
                  </div>
                  <ChevronRight size={16} className="text-slate-400" />
                </div>
                <div className="p-3">
                  <p className="text-xs text-slate-600 font-medium mb-1">Extractor Eléctrico Doble</p>
                  <p className="text-sm font-black text-slate-900">$250.000</p>
                </div>
              </div>

              {/* Orden 2 */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm hover:border-purple-300 transition-colors cursor-pointer group">
                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center group-hover:bg-purple-50/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900">Orden #001</span>
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md uppercase tracking-wider">En Camino (Transportadora)</span>
                  </div>
                  <ChevronRight size={16} className="text-slate-400" />
                </div>
                <div className="p-3">
                  <p className="text-xs text-slate-600 font-medium mb-1">Set de Biberones 8oz</p>
                  <p className="text-sm font-black text-slate-900">$85.000</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl">
                <div className="flex items-center gap-2 text-amber-700 font-bold text-xs mb-1">
                  <FileText size={14} /> Notas del Asesor
                </div>
                <p className="text-xs text-amber-900/80 leading-relaxed font-medium">
                  Interesada en envíos rápidos. Siempre solicita guía de tracking.
                </p>
              </div>
            </div>
          </div>"""

pattern = r"\{\/\* TOP: CRM & STATES \*\/}.*?(?=\{\/\* BOTTOM: NEBULAE IA \*\/})"
new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Done!")
