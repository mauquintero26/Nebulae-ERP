import re

with open('src/app/dashboard/ventas/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the Main Filter Bar
old_control = r"\{\/\* CONTROL MULTIVISTA \(Central\) \*\/\}.*?(?=\{\/\* RENDERIZADO DE VISTAS \*\/\})"

new_control = """{/* CONTROL MULTIVISTA (Central) */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm w-fit">
          <div className="flex p-1 bg-slate-100 rounded-xl w-fit overflow-x-auto">
            <button
              onClick={() => setActiveView('tabla')}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeView === 'tabla' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <TableIcon size={16} /> Tabla Dinámica
            </button>
            <button
              onClick={() => setActiveView('kanban')}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeView === 'kanban' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <KanbanSquare size={16} /> Kanban Logístico
            </button>
            <button
              onClick={() => setActiveView('calendario')}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeView === 'calendario' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Calendar size={16} /> Calendario Entregas
            </button>
            <button
              onClick={() => setActiveView('analisis')}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${activeView === 'analisis' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <BarChart3 size={16} /> Análisis de Venta
            </button>
          </div>
        </div>

        {/* BARRA DE FILTROS AVANZADOS */}
        {activeView === 'tabla' && (
          <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input type="text" placeholder="Buscar cliente, orden o email..." className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" />
            </div>
            <div className="flex items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg px-2">
              <input type="date" className="py-2 bg-transparent text-slate-600 outline-none" title="Fecha Inicio" />
              <span className="text-slate-300">|</span>
              <input type="date" className="py-2 bg-transparent text-slate-600 outline-none" title="Fecha Fin" />
            </div>
            <select className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 outline-none font-medium">
              <option>Categoría (Todas)</option>
              <option>Maternidad</option>
              <option>Esenciales</option>
              <option>Ropa</option>
            </select>
            <select className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 outline-none font-medium">
              <option>Tipo (Todos)</option>
              <option>Inmediata</option>
              <option>Por Pedido</option>
            </select>
            <select className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 outline-none font-medium">
              <option>Estado (Todos)</option>
              <option>Facturado</option>
              <option>Por Facturar</option>
              <option>En Despacho</option>
            </select>
          </div>
        )}
      </div>

      """

content = re.sub(old_control, new_control, content, flags=re.DOTALL)


# 2. Add Timeline (Stepper) in the Modal and fix Est. Delivery Date Format
old_info_cliente = r"\{\/\* Info Cliente & Direcciones \*\/\}[\s\S]*?(?=\{\/\* Info Logística y Pagos \*\/\})"
new_info_cliente = """{/* Info Cliente & Direcciones & Timeline */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cliente</p>
                      <button className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-black text-lg transition-colors group">
                        <User size={18} className="group-hover:scale-110 transition-transform"/> {selectedDetail.client}
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        <MapPin size={14}/> Dirección Facturación
                      </p>
                      <p className="text-sm text-slate-700 font-medium">Calle 123 #45-67, Edificio Alpha<br/>Bogotá, Colombia</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        <Truck size={14}/> Dirección Entrega
                      </p>
                      <p className="text-sm text-slate-700 font-medium">Calle 123 #45-67, Edificio Alpha<br/>Bogotá, Colombia</p>
                    </div>
                  </div>

                  {/* STEPPER HORIZONTAL (Línea de Tiempo del Pedido) */}
                  <div className="pt-6 border-t border-slate-100">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Línea de Tiempo del Pedido</h3>
                    <div className="flex items-center justify-between relative px-2">
                      {/* Background Bar */}
                      <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-100 -z-10"></div>
                      {/* Progress Bar (Mocked to 50%) */}
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 h-1 bg-blue-500 -z-10" style={{width: '50%'}}></div>
                      
                      {['Creado', 'Por Facturar', 'Facturado', 'En Despacho', 'Entregado'].map((step, idx) => {
                        const isActive = idx <= 2; // Mock: Current status is Facturado
                        return (
                          <div key={step} className="flex flex-col items-center gap-2 z-10">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-white shadow-sm ${isActive ? 'bg-blue-500 text-white' : 'bg-slate-200 text-transparent'}`}>
                              {isActive && <CheckCircle2 size={14} />}
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-blue-700' : 'text-slate-400'}`}>{step}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="text-center mt-4">
                      <p className="text-xs font-bold text-slate-500">Fecha de Creación: <span className="text-slate-800">{selectedDetail.date}</span></p>
                    </div>
                  </div>
                </div>

                """

content = re.sub(old_info_cliente, new_info_cliente, content, flags=re.DOTALL)


# 3. Update Est. Delivery Date format and add Calendar Link
old_logistica = r"\{\/\* Info Logística y Pagos \*\/\}[\s\S]*?(?=\{\/\* Tabla de Productos \*\/\})"
new_logistica = """{/* Info Logística y Pagos */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-2 gap-6">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 group cursor-pointer hover:text-blue-600 transition-colors">
                      <CalendarDays size={14}/> Fecha Entrega Est. <Edit size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </p>
                    <div className="flex items-center gap-3">
                      <p className="font-black text-slate-800 text-xl tracking-tight">2026-08-30</p>
                      <button 
                        onClick={() => { setActiveView('calendario'); setSelectedDetail(null); }}
                        className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors shadow-sm"
                        title="Ver en Calendario"
                      >
                        <Calendar size={16} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 group cursor-pointer hover:text-blue-600 transition-colors">
                      <CreditCard size={14}/> Condición de Pago <Edit size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </p>
                    <p className="font-bold text-slate-800 bg-slate-100 w-fit px-3 py-1.5 rounded-lg text-sm border border-slate-200">60/40 (Por Pedido)</p>
                  </div>
                </div>

                """

content = re.sub(old_logistica, new_logistica, content, flags=re.DOTALL)


# 4. Add "Generar Alerta Automática" to Quick Actions
old_quick_actions = r"\{\/\* Acciones Rápidas Omnicanal \*\/\}[\s\S]*?(?=\{\/\* Timeline de Historial \*\/\})"
new_quick_actions = """{/* Acciones Rápidas Omnicanal */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <h3 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wider">Acciones Rápidas</h3>
                  
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] text-white rounded-xl font-bold shadow-md shadow-green-200 hover:bg-[#1ebd5a] transition-all">
                    <MessageCircle size={18} /> Chat de Contexto (WhatsApp)
                  </button>
                  
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-200 transition-all text-sm">
                    <FileText size={16} /> Enviar Plantilla Factura
                  </button>
                  
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-bold hover:bg-amber-100 transition-all text-sm shadow-sm">
                    <AlertTriangle size={16} /> Configurar Alerta Automática
                  </button>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg font-bold hover:bg-blue-100 transition-all text-sm">
                      Registrar Nota
                    </button>
                    <button className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 border border-purple-100 rounded-lg font-bold hover:bg-purple-100 transition-all text-sm">
                      Registrar Actividad
                    </button>
                  </div>
                </div>

                """

content = re.sub(old_quick_actions, new_quick_actions, content, flags=re.DOTALL)

with open('src/app/dashboard/ventas/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done!")
