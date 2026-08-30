import re

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Inject the state variables and dragging logic
hook_code = """  // Column width states (for simple resizing simulation)
  const [inboxWidth, setInboxWidth] = useState(280);
  const [col4Width, setCol4Width] = useState(350);
  const [crmHeight, setCrmHeight] = useState(350);

  // Simple Drag Handlers
  const startDragInbox = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = inboxWidth;
    const onMouseMove = (moveEvent: MouseEvent) => {
      setInboxWidth(Math.max(200, Math.min(500, startWidth + (moveEvent.pageX - startX))));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const startDragCol4 = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = col4Width;
    const onMouseMove = (moveEvent: MouseEvent) => {
      // Moving left increases width for right-docked column
      setCol4Width(Math.max(300, Math.min(600, startWidth - (moveEvent.pageX - startX))));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const startDragCrmHeight = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.pageY;
    const startHeight = crmHeight;
    const onMouseMove = (moveEvent: MouseEvent) => {
      setCrmHeight(Math.max(200, Math.min(800, startHeight + (moveEvent.pageY - startY))));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };
"""

content = re.sub(r"  // Column width states.*?const \[inboxWidth, setInboxWidth\] = useState\(240\);", hook_code, content, flags=re.DOTALL)

# 2. Update Column 2 Handle
col2_pattern = r"\{\/\* Simple Resize Handle \(Visual Only for mock\) \*\/\}[\s\S]*?<\/div>\n      <\/div>"
new_col2 = """{/* Custom Resize Handle */}
        <div 
          onMouseDown={startDragInbox}
          className="absolute right-0 top-0 bottom-0 w-1.5 hover:bg-purple-400 hover:w-2 cursor-col-resize transition-all bg-slate-200/50 z-20" 
        />
      </div>"""
content = re.sub(col2_pattern, new_col2, content)
# Ensure we also remove inline CSS resize from Col 2
content = content.replace("resize: 'horizontal', minWidth: '250px', maxWidth: '500px'", "minWidth: '200px', maxWidth: '500px'")


# 3. Update Column 4
col4_pattern = r"\{\/\* COLUMN 4: CRM \+ AI COPILOT \*\/\}[\s\S]*?(?=\{\/\* PURCHASES MODAL \*\/\}|</div>\s*</div>\s*$)"

new_col4 = """{/* COLUMN 4: CRM + AI COPILOT */}
      <div 
        className="bg-slate-50 border-l border-slate-200 flex flex-col relative flex-shrink-0" 
        style={{ width: col4Width }}
      >
        {/* Left Resize Handle */}
        <div 
          onMouseDown={startDragCol4}
          className="absolute left-0 top-0 bottom-0 w-1.5 hover:bg-purple-400 hover:w-2 cursor-col-resize transition-all bg-transparent z-20 -ml-[1px]" 
        />

        {/* TOP: CRM PROFILE */}
        <div 
          className="flex flex-col bg-white border-b border-slate-300 relative" 
          style={{ height: crmHeight }}
        >
          <div className="p-5 border-b border-slate-100 bg-white sticky top-0 z-10 flex-shrink-0">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">María Fernanda</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-200">
                    ID: CLI-8924
                  </span>
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                    <Phone size={10} /> +57 300 555 1234
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-purple-200 transition-colors flex items-center justify-center gap-2">
                <Plus size={16} /> Nueva Solicitud
              </button>
            </div>
          </div>

          {/* Historial y Estados del CRM */}
          <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>Historial CRM</span>
              <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px]">3 Activos</span>
            </h3>

            <div className="space-y-3">
              {/* Item 1: Cotización */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm hover:border-purple-300 transition-colors cursor-pointer group">
                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center group-hover:bg-purple-50/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900">Cotización #095</span>
                  </div>
                  <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md uppercase tracking-wider border border-indigo-200">
                    Cotizado - pdte confirmación
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-xs text-slate-600 font-medium mb-1">Extractor Eléctrico Doble</p>
                  <p className="text-sm font-black text-slate-900">$250.000</p>
                </div>
              </div>

              {/* Item 2: Pago */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm hover:border-purple-300 transition-colors cursor-pointer group">
                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center group-hover:bg-purple-50/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900">Pago #092</span>
                  </div>
                  <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md uppercase tracking-wider border border-amber-200">
                    Factura enviada / Link
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-xs text-slate-600 font-medium mb-1">Coche Paseador Premium</p>
                  <p className="text-sm font-black text-slate-900">$850.000</p>
                </div>
              </div>

              {/* Item 3: Pedido de Venta (Completado) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm hover:border-emerald-300 transition-colors cursor-pointer group opacity-75 hover:opacity-100">
                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center group-hover:bg-emerald-50/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900">Pedido #089</span>
                  </div>
                  <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md uppercase tracking-wider border border-emerald-200">
                    Completado
                  </span>
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
          </div>
          
          {/* Bottom Resize Handle */}
          <div 
            onMouseDown={startDragCrmHeight}
            className="h-1.5 w-full bg-slate-200 cursor-row-resize hover:bg-purple-400 hover:h-2 transition-all absolute bottom-0 left-0 right-0 z-20"
          />
        </div>

        {/* BOTTOM: NEBULAE IA (Expands to fill remaining space) */}
        <div className="flex-1 flex flex-col bg-gradient-to-b from-slate-50 to-indigo-50/50 min-h-[100px] overflow-hidden">
          <div className="p-4 bg-white/60 backdrop-blur-md flex justify-between items-center border-b border-indigo-50 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-1.5 rounded-lg shadow-md shadow-indigo-200">
                <Sparkles className="text-white" size={14} />
              </div>
              <h3 className="font-extrabold text-indigo-900 text-sm">Agente IA</h3>
            </div>
            
            <label className="flex items-center cursor-pointer bg-white px-2 py-1 rounded-lg shadow-sm border border-slate-100">
              <span className="mr-2 text-[10px] font-bold text-slate-500 uppercase">Auto Mode</span>
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={autoReply} onChange={() => setAutoReply(!autoReply)} />
                <div className={`block w-9 h-5 rounded-full transition-colors ${autoReply ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
                <div className={`absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${autoReply ? 'transform translate-x-4' : ''}`}></div>
              </div>
            </label>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
            {/* Estado General AI */}
            <div className="bg-white p-3 rounded-xl border border-indigo-50 shadow-sm flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${autoReply ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'}`}></div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Estado del Agente</p>
                <p className="text-xs font-bold text-slate-700 leading-snug mt-0.5">
                  {autoReply ? 'Respondiendo automáticamente en nombre del asesor.' : 'Observando el chat. Sugiriendo respuestas al asesor.'}
                </p>
              </div>
            </div>

            {/* AI Suggestion */}
            <div className="bg-indigo-600 p-4 rounded-2xl shadow-md text-white">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-bold text-indigo-200 uppercase tracking-wider flex items-center gap-1">
                  <Bot size={12} /> Sugerencia
                </p>
                <span className="text-[9px] bg-indigo-500 px-1.5 py-0.5 rounded font-medium border border-indigo-400">Cotización</span>
              </div>
              <p className="text-sm font-medium leading-relaxed mb-3">"El extractor manual tiene un valor de $120.000 COP, y el eléctrico de $250.000 COP. ¿Te cotizo alguno con envío incluido?"</p>
              {!autoReply && (
                <div className="flex gap-2">
                  <button className="flex-1 bg-white text-indigo-600 hover:bg-indigo-50 text-xs font-bold py-2 rounded-lg transition-colors shadow-sm">
                    Insertar
                  </button>
                </div>
              )}
            </div>
            
            {!autoReply && (
              <button className="w-full bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-3 rounded-xl shadow-md transition-colors flex justify-center items-center gap-2 mt-auto">
                <Bot size={14} /> Analizar
              </button>
            )}
          </div>
        </div>
      </div>
      
"""
content = re.sub(col4_pattern, new_col4, content)

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Drag handles implemented")
