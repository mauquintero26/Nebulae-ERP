import re

with open('src/app/dashboard/crm/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add view toggles and restructure
import_pattern = r"import \{ useState \} from 'react';"
new_imports = """import { useState } from 'react';
import { LayoutList, KanbanSquare, BarChart3, Download, TrendingUp } from 'lucide-react';"""
if "KanbanSquare" not in content:
    content = re.sub(import_pattern, new_imports, content)

state_pattern = r"export default function CRMPage\(\) \{\s*const \[columns, setColumns\] = useState\(INITIAL_KANBAN\);\s*const \[selectedCard, setSelectedCard\] = useState<any \| null>\(null\);"
new_state = """export default function CRMPage() {
  const [columns, setColumns] = useState(INITIAL_KANBAN);
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [activeView, setActiveView] = useState<'kanban' | 'lista' | 'analisis'>('kanban');"""
content = re.sub(state_pattern, new_state, content)

header_pattern = r"\{\/\* Header \*\/\}[\s\S]*?(?=\{\/\* Kanban Board \- Full Width and Scrollable \*\/})"
new_header = """{/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Pipeline Comercial</h1>
          <p className="text-slate-500 mt-1">Gestión de leads, seguimientos y embudos de ventas.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setActiveView('kanban')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeView === 'kanban' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <KanbanSquare size={16} /> Kanban
            </button>
            <button
              onClick={() => setActiveView('lista')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeView === 'lista' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LayoutList size={16} /> Lista
            </button>
            <button
              onClick={() => setActiveView('analisis')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeView === 'analisis' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <BarChart3 size={16} /> Análisis CRM
            </button>
          </div>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-purple-200">
            <Plus size={18} /> Nuevo Lead
          </button>
        </div>
      </div>

      """
content = re.sub(header_pattern, new_header, content)

kanban_pattern = r"\{\/\* Kanban Board \- Full Width and Scrollable \*\/\}[\s\S]*?(?=\{\/\* Right Sidebar \- Details \(Slide in if selected\) \*\/})"
kanban_content = re.search(kanban_pattern, content).group(0)

new_views = """{/* RENDERIZADO DE VISTAS */}
      <div className="flex-1 overflow-hidden flex flex-col pt-4">
        {activeView === 'kanban' && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
            <div className="flex h-full gap-5 min-w-max px-1">
              {columns.map(col => (
                <div key={col.id} className="flex flex-col w-80 bg-slate-100/50 rounded-2xl border border-slate-200/60 overflow-hidden">
                  <div className="p-4 border-b border-slate-200/50 flex items-center justify-between bg-white/40">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${col.color} shadow-sm`}></div>
                      <h3 className="font-bold text-slate-800">{col.title}</h3>
                      <span className="text-xs font-bold text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full">{col.cards.length}</span>
                    </div>
                    <button className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors"><MoreHorizontal size={16}/></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                    {col.cards.map(card => (
                      <div 
                        key={card.id} 
                        className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:border-purple-300 hover:shadow-md transition-all group"
                        onClick={() => setSelectedCard(card)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${col.bgColor} ${col.color.replace('bg-', 'text-')}`}>
                            {card.tag}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md flex items-center gap-1">
                            <Clock size={10} /> {card.days}d
                          </span>
                        </div>
                        
                        <h4 className="font-black text-slate-800 text-sm mb-1">{card.client}</h4>
                        <p className="text-xs font-medium text-slate-500 mb-4">{card.contact}</p>
                        
                        <div className="flex justify-between items-end border-t border-slate-100 pt-3">
                          <span className="font-black text-slate-900 text-sm">${card.value.toLocaleString('es-CO')}</span>
                          <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button className="p-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-md transition-colors" title="WhatsApp" onClick={(e) => e.stopPropagation()}>
                              <MessageCircle size={14} />
                            </button>
                            <button className="p-1.5 bg-pink-50 text-pink-600 hover:bg-pink-100 rounded-md transition-colors" title="Instagram" onClick={(e) => e.stopPropagation()}>
                              <ExternalLink size={14} />
                            </button>
                            <button className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md transition-colors" title="Enviar Correo" onClick={(e) => e.stopPropagation()}>
                              <Mail size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'lista' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contacto</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Etapa (Pipeline)</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Valor Oportunidad</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Antigüedad</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {columns.flatMap(col => col.cards.map(card => ({...card, etapa: col.title, color: col.color, bgColor: col.bgColor}))).map(card => (
                  <tr key={card.id} onClick={() => setSelectedCard(card)} className="hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="p-4 font-bold text-slate-900 text-sm">{card.client}</td>
                    <td className="p-4 text-slate-600 text-sm">{card.contact}</td>
                    <td className="p-4">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${card.bgColor} ${card.color.replace('bg-', 'text-')}`}>
                        {card.etapa}
                      </span>
                    </td>
                    <td className="p-4 font-black text-slate-800 text-sm">${card.value.toLocaleString('es-CO')}</td>
                    <td className="p-4 text-slate-600 text-sm flex items-center gap-1"><Clock size={12}/> {card.days} días</td>
                    <td className="p-4 text-slate-500 text-sm font-medium">{card.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeView === 'analisis' && (
          <div className="flex-1 overflow-y-auto p-2">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800">Métricas y SLAs del CRM</h2>
              <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors">
                <Download size={16}/> Exportar Reporte Legible (PDF)
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tasa de Cierres</h3>
                <div className="flex items-end gap-3">
                  <p className="text-3xl font-black text-emerald-600">68%</p>
                  <p className="text-sm text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md mb-1">+5% vs Mes Ant.</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tiempo de Ciclo Promedio</h3>
                <div className="flex items-end gap-3">
                  <p className="text-3xl font-black text-blue-600">14 Días</p>
                  <p className="text-sm text-slate-500 font-medium mb-1">Desde Nuevo a Facturado</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Cumplimiento SLA (Respuestas)</h3>
                <div className="flex items-end gap-3">
                  <p className="text-3xl font-black text-purple-600">92%</p>
                  <p className="text-sm text-slate-500 font-medium mb-1">Tickets &lt; 2h</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-64 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <TrendingUp size={48} className="mx-auto mb-4 opacity-50"/>
                <p className="font-medium">Gráfico de Conversión por Etapas en construcción</p>
              </div>
            </div>
          </div>
        )}
      </div>

      """
content = content.replace(kanban_content, new_views)

with open('src/app/dashboard/crm/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("CRM Page Updated")
