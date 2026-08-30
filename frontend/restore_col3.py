import re

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

col3_code = """
      {/* COLUMN 3: CHAT THREAD */}
      <div className="flex-1 flex flex-col bg-slate-50/50 relative min-w-[300px]">
        <div className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-200 to-blue-200 flex items-center justify-center text-purple-700 font-bold shadow-inner">
              MF
            </div>
            <div>
              <h3 className="font-bold text-slate-800 leading-tight">María Fernanda</h3>
              <span className="text-xs text-green-500 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> En línea
              </span>
            </div>
          </div>
          <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <MoreVertical size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {MESSAGES.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'client' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[75%] rounded-2xl px-5 py-3 shadow-sm ${
                msg.sender === 'client' 
                  ? 'bg-white border border-slate-200 text-slate-700 rounded-tl-none' 
                  : 'bg-purple-600 text-white rounded-tr-none'
              }`}>
                <p className="text-sm leading-relaxed">{msg.text}</p>
                <div className={`text-[10px] mt-1.5 flex items-center justify-end gap-1 ${msg.sender === 'client' ? 'text-slate-400' : 'text-purple-200'}`}>
                  {msg.time} {msg.sender === 'agent' && <CheckCheck size={12} />}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-white border-t border-slate-200">
          <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 p-2 rounded-2xl focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100 transition-all">
            <button className="p-2 text-slate-400 hover:text-purple-600 rounded-xl hover:bg-white transition-colors">
              <Paperclip size={20} />
            </button>
            <button 
              onClick={() => setShowQuoteModal(true)}
              className="p-2 text-slate-400 hover:text-purple-600 rounded-xl hover:bg-white transition-colors" 
              title="Formato Cotización"
            >
              <Calculator size={20} />
            </button>
            <textarea 
              rows={1}
              className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-2 text-sm text-slate-700 outline-none max-h-32 custom-scrollbar"
              placeholder="Escribe un mensaje o usa / para comandos..."
            />
            <button className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors shadow-sm shadow-purple-200">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
"""

# Find where to insert it. It should be right before {/* COLUMN 4: CRM + AI COPILOT */}
pattern = r"\{\/\* COLUMN 4: CRM \+ AI COPILOT \*\/\}$"

content = re.sub(pattern, col3_code + "\n      {/* COLUMN 4: CRM + AI COPILOT */}", content, flags=re.MULTILINE)

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Column 3 Restored")
