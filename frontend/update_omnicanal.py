import re

with open('src/app/dashboard/asistente_omnicanal/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# We want to replace the CRM & STATES block.
# Let's find the boundaries.
start_marker = r"\{\/\* TOP: CRM & STATES \*\/}"
end_marker = r"\{\/\* BOTTOM: AI COPILOT \*\/}"

# The file might not have the BOTTOM marker if I didn't include it in the grep, but let's check.
if "BOTTOM: AI COPILOT" not in content:
    print("Could not find bottom marker!")

# Instead of regex, let's just do a clean string replacement.
old_crm_block = """          {/* TOP: CRM & STATES */}
          <div className="flex-1 overflow-y-auto p-5 border-b border-slate-200 relative">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-2">
              <User className="text-purple-600" size={20} />
              <h2 className="text-lg font-extrabold text-slate-800 tracking-tight">CRM Profile</h2>
            </div>
            <button className="flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800 bg-purple-50 px-2.5 py-1.5 rounded-lg transition-colors">
              Ir a CRM <ExternalLink size={14} />
            </button>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-6">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Pipeline Actual</h4>
            <div className="space-y-2">
              {PIPELINE_STATES.map((state, idx) => {
                const isActive = idx === 0; // Mocked active
                return (
                  <div key={state} className={`flex items-center gap-3 p-2 rounded-xl text-sm font-medium transition-colors ${isActive ? 'bg-white shadow-sm border border-purple-100 text-purple-700' : 'text-slate-500 opacity-60'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 ${isActive ? 'border-purple-600 bg-purple-50' : 'border-slate-300'}`}>
                      {isActive && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                    </div>
                    {state}
                  </div>
                )
              })}
            </div>
          </div>"""

# Let's read the file again completely to see what's after this.
