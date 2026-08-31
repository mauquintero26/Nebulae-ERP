"use client";

import { useState } from 'react';
import { 
  Phone, Mail, MessageCircle, FileText, CheckCircle2, 
  Clock, AlertCircle, Search, Filter, Bot, Calendar,
  MoreVertical, Send, Paperclip, Activity
} from 'lucide-react';

const PIPELINES = ['Nuevo', 'Solicitud Cliente', 'Cotización', 'Pago', 'Pedido de Venta'];

const MOCK_DATA = {
  'Nuevo': [
    { id: 'SEG-1001', name: 'Laura Gómez', product: 'Consulta General', status: 'Recién ingresado', daysInStatus: 1, lastAction: 'Llenó formulario web' },
    { id: 'SEG-1002', name: 'Andrés Felipe', product: 'Duda sobre envíos', status: 'Asignado a Asesor', daysInStatus: 3, lastAction: 'Asignación automática' }
  ],
  'Solicitud Cliente': [
    { id: 'SEG-1010', name: 'Marta Ríos', product: 'Set Biberones', status: 'Esperando requerimientos', daysInStatus: 4, lastAction: 'Mensaje de saludo enviado' },
    { id: 'SEG-1011', name: 'Camilo Pérez', product: 'Coche Paseador', status: 'Requerimientos completos', daysInStatus: 1, lastAction: 'Cliente envió referencias' }
  ],
  'Cotización': [
    { id: 'SEG-1024', name: 'Andrés Silva', product: 'Set de Biberones 8oz', status: 'Pendiente por cotizar', daysInStatus: 4, lastAction: 'Llamada no contestada' },
    { id: 'SEG-1027', name: 'Martha López', product: 'Coche Paseador', status: 'Pendiente por cotizar', daysInStatus: 1, lastAction: 'Consulta de precio' },
    { id: 'SEG-1025', name: 'Carlos Mendoza', product: 'Extractor Eléctrico', status: 'Cotizado - pdte confirmación', daysInStatus: 2, lastAction: 'Cotización enviada' },
    { id: 'SEG-1028', name: 'Diana Ríos', product: 'Monitor de Bebé', status: 'Cotización confirmada', daysInStatus: 0, lastAction: 'Aceptó precio' }
  ],
  'Pago': [
    { id: 'SEG-1029', name: 'Luis Fernando', product: 'Silla de Auto', status: 'Factura enviada / Link de pago', daysInStatus: 5, lastAction: 'Envío de link de pago' },
    { id: 'SEG-1030', name: 'Carmen Velez', product: 'Corral Cuna', status: 'Promesa de pago', daysInStatus: 2, lastAction: 'Cliente confirmó pago mañana' },
    { id: 'SEG-1031', name: 'Jorge Tovar', product: 'Monitor Pro', status: 'Pago recibido - Validando', daysInStatus: 1, lastAction: 'Comprobante adjuntado' }
  ],
  'Pedido de Venta': [
    { id: 'SEG-1040', name: 'Ana Silva', product: 'Cuna Colecho', status: 'Procesando orden', daysInStatus: 1, lastAction: 'Enviado a bodega' },
    { id: 'SEG-1041', name: 'David Ríos', product: 'Silla de Auto', status: 'Completado', daysInStatus: 0, lastAction: 'Facturación emitida' }
  ]
};

const STATUSES_BY_PIPELINE: Record<string, string[]> = {
  'Nuevo': ['Recién ingresado', 'Asignado a Asesor'],
  'Solicitud Cliente': ['Esperando requerimientos', 'Requerimientos completos'],
  'Cotización': ['Pendiente por cotizar', 'Cotizado - pdte confirmación', 'Cotización confirmada'],
  'Pago': ['Factura enviada / Link de pago', 'Promesa de pago', 'Pago recibido - Validando'],
  'Pedido de Venta': ['Procesando orden', 'Completado']
};

export default function SeguimientosPage() {
  const [activePipeline, setActivePipeline] = useState('Cotización');
  const [selectedLead, setSelectedLead] = useState<any>(MOCK_DATA['Cotización'][0]);
  const [chatterTab, setChatterTab] = useState('WhatsApp');

  const leads = MOCK_DATA[activePipeline as keyof typeof MOCK_DATA] || [];
  const pipelineStatuses = STATUSES_BY_PIPELINE[activePipeline] || [];

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden animate-in fade-in">
      
      {/* Header General */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex justify-between items-center flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Phone className="text-purple-600" /> Mis Seguimientos
          </h1>
          <p className="text-sm text-slate-500 font-medium">Gestiona los seguimientos por etapa del Pipeline CRM</p>
        </div>
        
        {/* Pipeline Selectors (The 5 Macro Stages) */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {PIPELINES.map(pipe => (
            <button
              key={pipe}
              onClick={() => { setActivePipeline(pipe); setSelectedLead(MOCK_DATA[pipe as keyof typeof MOCK_DATA]?.[0]); }}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activePipeline === pipe ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {pipe}
            </button>
          ))}
        </div>
      </div>

      {/* Split Pane */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Pane: Vertical Kanban grouped by Status */}
        <div className="w-[420px] bg-slate-50 border-r border-slate-200 flex flex-col flex-shrink-0">
          
          {/* Search */}
          <div className="p-4 bg-white border-b border-slate-200 flex gap-2 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input type="text" placeholder={`Buscar en ${activePipeline}...`} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>
            <button className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 bg-white"><Filter size={16}/></button>
          </div>

          {/* List of Leads Grouped by Status */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {pipelineStatuses.map(status => {
              const statusLeads = leads.filter(l => l.status === status);
              return (
                <div key={status} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">{status}</h3>
                    <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{statusLeads.length}</span>
                  </div>
                  
                  {statusLeads.length === 0 && (
                    <div className="text-xs font-medium text-slate-400 italic border-2 border-dashed border-slate-200 p-4 rounded-xl text-center">
                      No hay seguimientos aquí
                    </div>
                  )}

                  {statusLeads.map(lead => {
                    // Logic: >= 3 days = Red, else Gray/Blue
                    const isOverdue = lead.daysInStatus >= 3;
                    return (
                      <div 
                        key={lead.id} 
                        onClick={() => setSelectedLead(lead)}
                        className={`bg-white p-4 rounded-xl border-2 transition-all cursor-pointer shadow-sm relative overflow-hidden ${selectedLead?.id === lead.id ? 'border-purple-600 shadow-md ring-2 ring-purple-100' : 'border-slate-200 hover:border-purple-300'}`}
                      >
                        {/* Status Left Border Indicator */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isOverdue ? 'bg-rose-500' : 'bg-slate-300'}`}></div>
                        
                        <div className="flex justify-between items-start mb-2 pl-2">
                          <span className="text-xs font-black text-slate-400">{lead.id}</span>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 ${isOverdue ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                            <Clock size={10} /> {lead.daysInStatus} {lead.daysInStatus === 1 ? 'día' : 'días'} {isOverdue && '(Vencido)'}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-base pl-2">{lead.name}</h4>
                        <p className="text-xs text-slate-500 mb-3 pl-2">{lead.product}</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium bg-slate-50 p-2 rounded-lg ml-2 border border-slate-100">
                          <Activity size={12} className="text-slate-400" /> Última: {lead.lastAction}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Pane: Detail View */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden relative border-l border-slate-200">
          {selectedLead ? (
            <>
              {/* Detail Header */}
              <div className="p-6 border-b border-slate-200 flex justify-between items-start bg-slate-50/50">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-3xl font-black text-slate-900">{selectedLead.name}</h2>
                    <span className="bg-slate-100 text-slate-600 font-bold px-3 py-1 rounded-full text-xs border border-slate-200">{selectedLead.id}</span>
                    <span className="bg-purple-100 text-purple-700 font-bold px-3 py-1 rounded-full text-xs flex items-center gap-1 border border-purple-200">
                      <Activity size={12}/> {activePipeline}: {selectedLead.status}
                    </span>
                  </div>
                  <p className="text-slate-500 font-medium mt-2 flex items-center gap-2">
                    <span className="bg-white px-3 py-1 rounded-md border border-slate-200 shadow-sm text-xs">Interesado en: <strong className="text-slate-700">{selectedLead.product}</strong></span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <select className="bg-white border border-slate-300 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-purple-500">
                    {pipelineStatuses.map(s => <option key={s} selected={s === selectedLead.status}>{s}</option>)}
                  </select>
                  <button className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md flex items-center gap-2 transition-colors">
                    <Calendar size={14}/> Agendar Cita
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                
                {/* AI Context */}
                <div className="bg-indigo-50/80 border border-indigo-100 rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Bot size={100} />
                  </div>
                  <h3 className="flex items-center gap-2 font-black text-indigo-900 mb-3 relative z-10">
                    <Bot size={18} className="text-indigo-600"/> Resumen de Evolución e IA
                  </h3>
                  <p className="text-sm text-indigo-900/80 leading-relaxed font-medium mb-3 relative z-10">
                    El cliente se encuentra en <strong className="text-indigo-700">"{selectedLead.status}"</strong>. 
                    {selectedLead.daysInStatus >= 3 
                      ? ' Ha excedido el tiempo promedio de respuesta de 2 a 3 días. Se sugiere contacto prioritario o escalar el ticket.' 
                      : ' Está dentro del marco de tiempo normal. Sugiero hacer una llamada corta para resolver dudas.'}
                  </p>
                  {selectedLead.daysInStatus >= 3 && (
                    <div className="mt-4 flex items-center gap-2 text-rose-700 bg-rose-100/80 p-3 rounded-lg text-sm font-bold relative z-10 border border-rose-200">
                      <AlertCircle size={16}/> ¡Alerta de SLA! El lead lleva {selectedLead.daysInStatus} días en este estado. Timer vencido.
                    </div>
                  )}
                </div>

                {/* Chatter */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex bg-slate-50 border-b border-slate-200">
                    <button onClick={() => setChatterTab('WhatsApp')} className={`flex-1 py-3 text-sm font-bold flex justify-center items-center gap-2 transition-colors ${chatterTab === 'WhatsApp' ? 'bg-white text-[#25D366] border-t-2 border-t-[#25D366] shadow-[0_4px_0_0_#ffffff_inset]' : 'text-slate-500 hover:bg-slate-100'}`}><MessageCircle size={16}/> WhatsApp</button>
                    <button onClick={() => setChatterTab('Llamada')} className={`flex-1 py-3 text-sm font-bold flex justify-center items-center gap-2 transition-colors ${chatterTab === 'Llamada' ? 'bg-white text-blue-600 border-t-2 border-t-blue-600 shadow-[0_4px_0_0_#ffffff_inset]' : 'text-slate-500 hover:bg-slate-100'}`}><Phone size={16}/> Llamada</button>
                    <button onClick={() => setChatterTab('Correo')} className={`flex-1 py-3 text-sm font-bold flex justify-center items-center gap-2 transition-colors ${chatterTab === 'Correo' ? 'bg-white text-rose-600 border-t-2 border-t-rose-600 shadow-[0_4px_0_0_#ffffff_inset]' : 'text-slate-500 hover:bg-slate-100'}`}><Mail size={16}/> Correo</button>
                    <button onClick={() => setChatterTab('Nota Interna')} className={`flex-1 py-3 text-sm font-bold flex justify-center items-center gap-2 transition-colors ${chatterTab === 'Nota Interna' ? 'bg-white text-amber-600 border-t-2 border-t-amber-600 shadow-[0_4px_0_0_#ffffff_inset]' : 'text-slate-500 hover:bg-slate-100'}`}><FileText size={16}/> Nota Interna</button>
                  </div>
                  <div className="p-4 bg-white">
                    {chatterTab === 'WhatsApp' && (
                      <div className="space-y-4 animate-in fade-in">
                        <div className="bg-green-50 text-green-800 text-xs font-bold p-3 rounded-lg flex items-center gap-2 border border-green-100">
                          <MessageCircle size={14}/> El mensaje quedará registrado en el tracking y el backend avanzará el estado si el cliente responde.
                        </div>
                        <textarea 
                          rows={4}
                          placeholder={`Hola ${selectedLead.name.split(' ')[0]}, ¿cómo estás? Te comparto la información...`}
                          className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#25D366] outline-none resize-none bg-slate-50"
                        ></textarea>
                        <div className="flex justify-between items-center">
                          <button className="text-slate-400 hover:text-slate-600 p-2"><Paperclip size={18}/></button>
                          <button className="bg-[#25D366] hover:bg-[#1ebd5a] text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm transition-colors">
                            Enviar Mensaje <Send size={14}/>
                          </button>
                        </div>
                      </div>
                    )}
                    {chatterTab !== 'WhatsApp' && (
                      <div className="py-8 text-center text-slate-400 text-sm font-medium animate-in fade-in">
                        Interfaz funcional para registrar {chatterTab.toLowerCase()} lista para integrar.
                      </div>
                    )}
                  </div>
                </div>

                {/* Activity Tracking */}
                <div className="pt-6 border-t border-slate-100">
                  <h3 className="font-black text-slate-800 mb-6 uppercase tracking-wider text-xs">Tracking de Actividad (Auditoría)</h3>
                  <div className="relative border-l-2 border-slate-100 ml-3 space-y-6">
                    <div className="relative pl-6">
                      <div className="absolute left-[-9px] top-1 w-4 h-4 rounded-full bg-slate-800 border-4 border-white shadow-sm"></div>
                      <p className="text-xs font-bold text-slate-400 mb-0.5">Hoy</p>
                      <p className="text-sm font-bold text-slate-800">Acción: {selectedLead.lastAction}</p>
                      <p className="text-xs text-slate-500 mt-1">Registrado por: Usuario / Canal Omnicanal</p>
                    </div>
                    <div className="relative pl-6 opacity-80">
                      <div className="absolute left-[-9px] top-1 w-4 h-4 rounded-full bg-purple-500 border-4 border-white shadow-sm"></div>
                      <p className="text-xs font-bold text-slate-400 mb-0.5">Hace {selectedLead.daysInStatus} días</p>
                      <p className="text-sm font-bold text-slate-800">Ingresó al estado "{selectedLead.status}"</p>
                      <p className="text-xs text-slate-500 mt-1">Registrado por: Automatización del Pipeline</p>
                    </div>
                  </div>
                </div>

              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 font-medium">
              <Phone size={48} className="mb-4 opacity-20" />
              <p>Selecciona un seguimiento del panel izquierdo</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
