"use client";

import { useState } from 'react';
import { LayoutList, KanbanSquare, BarChart3, Download, TrendingUp } from 'lucide-react';
import { 
  MoreHorizontal, Plus, Search, Filter, 
  MessageCircle, Mail, Phone, ExternalLink,
  Calendar, DollarSign, Clock, CheckCircle2,
  AlertCircle, ChevronRight, Calculator, Edit3
} from 'lucide-react';

// MOCKS
const INITIAL_KANBAN = [
  {
    id: 'col-1', title: 'Nuevo', color: 'bg-blue-500', bgColor: 'bg-blue-50/50',
    cards: [
      { id: 'lead-1', client: 'Empresa Alpha SAS', contact: 'Juan Pérez', value: 1250000, days: 1, source: 'Instagram', tag: 'Alta Prioridad' }
    ]
  },
  {
    id: 'col-2', title: 'Solicitud Cliente', color: 'bg-cyan-500', bgColor: 'bg-cyan-50/50',
    cards: [
      { id: 'lead-2', client: 'Inversiones Beta', contact: 'María Gómez', value: 850000, days: 3, source: 'WhatsApp', tag: 'Seguimiento' }
    ]
  },
  {
    id: 'col-3', title: 'Cotización', color: 'bg-indigo-500', bgColor: 'bg-indigo-50/50',
    cards: [
      { id: 'lead-3', client: 'Constructora Gamma', contact: 'Carlos Ruiz', value: 4500000, days: 2, source: 'Correo', tag: 'Enviada' },
      { id: 'lead-4', client: 'Distribuidora Delta', contact: 'Ana Silva', value: 3200000, days: 5, source: 'WhatsApp', tag: 'Revisión' }
    ]
  },
  {
    id: 'col-4', title: 'Pago', color: 'bg-amber-500', bgColor: 'bg-amber-50/50',
    cards: [
      { id: 'lead-6', client: 'Servicios Zeta', contact: 'Elena Soto', value: 6700000, days: 4, source: 'Reunión', tag: 'Acuerdo Plazos' }
    ]
  },
  {
    id: 'col-5', title: 'Pedido de Venta', color: 'bg-emerald-500', bgColor: 'bg-emerald-50/50',
    cards: [
      { id: 'lead-7', client: 'Grupo Omega', contact: 'David Ríos', value: 9500000, days: 0, source: 'Referido', tag: 'Completado' }
    ]
  }
];

export default function CRMKanbanPage() {
  const [activeView, setActiveView] = useState<'kanban' | 'lista' | 'analisis'>('kanban');
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [board, setBoard] = useState(INITIAL_KANBAN);

  const handleTitleChange = (colId: string, newTitle: string) => {
    setBoard(prev => prev.map(col => col.id === colId ? { ...col, title: newTitle } : col));
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-50/50 relative overflow-hidden">
      {/* Header */}
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

      {/* RENDERIZADO DE VISTAS */}
      <div className="flex-1 overflow-hidden flex flex-col pt-4">
        {activeView === 'kanban' && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
            <div className="flex h-full gap-5 min-w-max px-1">
              {board.map(col => (
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
                {board.flatMap(col => col.cards.map(card => ({...card, etapa: col.title, color: col.color, bgColor: col.bgColor}))).map(card => (
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

      {/* Right Sidebar - Details (Slide in if selected) */}
      {selectedCard && (
        <div className="absolute top-0 right-0 bottom-0 w-[450px] bg-white shadow-2xl border-l border-slate-200 z-50 animate-in slide-in-from-right duration-300 flex flex-col">
          <div className="h-20 border-b border-slate-100 flex items-center justify-between px-6 bg-slate-50/50 flex-shrink-0">
            <div>
              <h2 className="text-lg font-black text-slate-800">{selectedCard.client}</h2>
              <p className="text-sm font-medium text-slate-500">{selectedCard.contact}</p>
            </div>
            <button onClick={() => setSelectedCard(null)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Value & State */}
            <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100">
              <p className="text-xs font-bold text-purple-500 uppercase tracking-wider mb-1">Valor de Oportunidad</p>
              <h3 className="text-3xl font-black text-purple-700">${selectedCard.value.toLocaleString('es-CO')} COP</h3>
              
              <div className="mt-4 flex gap-2">
                <button className="flex-1 bg-purple-600 text-white py-2 rounded-xl text-sm font-bold shadow-md shadow-purple-200 hover:bg-purple-700 transition-colors flex items-center justify-center gap-2">
                  <Calculator size={16} /> Cotizar
                </button>
                <button className="flex-1 bg-white text-purple-700 border border-purple-200 py-2 rounded-xl text-sm font-bold hover:bg-purple-50 transition-colors flex items-center justify-center gap-2">
                  <MessageCircle size={16} /> Contactar
                </button>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Acciones Rápidas</h4>
              <div className="grid grid-cols-2 gap-3">
                <button className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-green-400 hover:shadow-sm transition-all group">
                  <div className="bg-green-100 text-green-600 p-2 rounded-lg group-hover:bg-green-500 group-hover:text-white transition-colors">
                    <MessageCircle size={16} />
                  </div>
                  <span className="text-sm font-bold text-slate-700">WhatsApp</span>
                </button>
                <button className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-pink-400 hover:shadow-sm transition-all group">
                  <div className="bg-pink-100 text-pink-600 p-2 rounded-lg group-hover:bg-pink-500 group-hover:text-white transition-colors">
                    <ExternalLink size={16} />
                  </div>
                  <span className="text-sm font-bold text-slate-700">Instagram</span>
                </button>
                <button className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-sm transition-all group">
                  <div className="bg-blue-100 text-blue-600 p-2 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <Mail size={16} />
                  </div>
                  <span className="text-sm font-bold text-slate-700">Enviar Correo</span>
                </button>
                <button className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-amber-400 hover:shadow-sm transition-all group">
                  <div className="bg-amber-100 text-amber-600 p-2 rounded-lg group-hover:bg-amber-500 group-hover:text-white transition-colors">
                    <Calendar size={16} />
                  </div>
                  <span className="text-sm font-bold text-slate-700">Agendar Cita</span>
                </button>
              </div>
            </div>

            {/* History */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Historial Reciente</h4>
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-purple-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                    <CheckCircle2 size={12} />
                  </div>
                  <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-bold text-slate-800 text-sm">Cotización Enviada</div>
                      <time className="font-mono text-xs text-slate-400">Hoy 10:30</time>
                    </div>
                    <div className="text-xs text-slate-500 font-medium">Cotización de 3 Items ($4.5M) por WhatsApp.</div>
                  </div>
                </div>

                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-slate-300 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                    <AlertCircle size={12} />
                  </div>
                  <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-bold text-slate-600 text-sm">Lead Creado</div>
                      <time className="font-mono text-xs text-slate-400">Ayer</time>
                    </div>
                    <div className="text-xs text-slate-500">Contacto inicial vía {selectedCard.source}.</div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Background Overlay */}
      {selectedCard && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity" 
          onClick={() => setSelectedCard(null)} 
        />
      )}
    </div>
  );
}
