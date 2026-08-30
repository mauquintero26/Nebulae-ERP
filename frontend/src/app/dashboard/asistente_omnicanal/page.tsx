'use client';

import { useState } from 'react';
import { 
  MessageCircle, Plus, Camera, Globe, LayoutGrid, 
  Search, MoreVertical, Send, Paperclip, CheckCheck,
  Bot, Sparkles, Receipt, FileText, ChevronRight, User, ExternalLink, X, ShoppingCart, Calculator, ArrowRight, Phone, Mail
} from 'lucide-react';
import { calculateQuotation } from '@/lib/api';

// MOCKS
const CHANNELS = [
  { id: 'all', icon: LayoutGrid, label: 'Todos', unread: 12 },
  { id: 'whatsapp', icon: MessageCircle, label: 'WhatsApp', unread: 8, color: 'text-green-500 bg-green-50' },
  { id: 'instagram', icon: Camera, label: 'Instagram', unread: 3, color: 'text-pink-500 bg-pink-50' },
  { id: 'facebook', icon: Globe, label: 'Facebook', unread: 1, color: 'text-blue-500 bg-blue-50' },
];

const INBOX = [
  { id: 1, name: 'María Fernanda', preview: 'Hola, quisiera info del extractor...', time: '10:42 AM', unread: 2, channel: 'whatsapp', state: 'Lead Fresco' },
  { id: 2, name: 'Carlos Ruiz', preview: 'Ya realicé la transferencia.', time: '09:15 AM', unread: 0, channel: 'instagram', state: 'Pendiente por pago' },
  { id: 3, name: 'Ana Gómez', preview: '¿Tienen el biberón de 8oz?', time: 'Ayer', unread: 1, channel: 'whatsapp', state: 'Cotización' },
  { id: 4, name: 'Luisa Martínez', preview: 'Gracias por la atención.', time: 'Ayer', unread: 0, channel: 'facebook', state: 'Seguimiento' },
];

const MESSAGES = [
  { id: 1, text: '¡Hola! Me interesa el extractor manual de leche.', sender: 'client', time: '10:30 AM' },
  { id: 2, text: '¡Hola María Fernanda! Claro que sí, con gusto te brindo la información. Tenemos dos modelos disponibles...', sender: 'agent', time: '10:32 AM' },
  { id: 3, text: '¿Me podrías enviar el precio de ambos?', sender: 'client', time: '10:42 AM' },
];

const PIPELINE_STATES = ['Lead Fresco', 'Cotización', 'Pendiente por pago', 'Seguimiento'];

const PAST_PURCHASES = [
  { id: 'ORD-001', date: '12 Ago 2026', items: 'Extractor Eléctrico Doble', total: '$250.000', status: 'Entregado' },
  { id: 'ORD-002', date: '05 Jul 2026', items: 'Set de Biberones 8oz (x3)', total: '$85.000', status: 'En tránsito' },
  { id: 'ORD-003', date: '15 May 2026', items: 'Esterilizador a vapor', total: '$140.000', status: 'Seguimiento' },
];

export default function CRMPage() {
  const [activeChannel, setActiveChannel] = useState('all');
  const [activeChat, setActiveChat] = useState(1);
  const [autoReply, setAutoReply] = useState(false);
  const [showPurchasesModal, setShowPurchasesModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  
  // Quotation state
  const [quoteForm, setQuoteForm] = useState({
    costUsd: '',
    discount: '0',
    weightLb: '1',
    trm: '4000'
  });
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Column width states (for simple resizing simulation)
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

  
  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCalculating(true);
    setQuoteResult(null);
    try {
      const result = await calculateQuotation(
        parseFloat(quoteForm.costUsd),
        parseFloat(quoteForm.discount),
        parseFloat(quoteForm.weightLb),
        parseFloat(quoteForm.trm)
      );
      setQuoteResult(result);
    } catch (err) {
      console.error(err);
      alert("Error al calcular la cotización. Asegúrate de que el backend esté corriendo y responda.");
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="h-full w-full bg-white flex overflow-hidden">
      
      {/* COLUMN 1: CHANNELS (Narrow Sidebar) */}
      <div className="w-20 bg-slate-50 border-r border-slate-200 flex flex-col items-center py-6 gap-6 z-10 flex-shrink-0">
        {CHANNELS.map(chan => (
          <button 
            key={chan.id}
            onClick={() => setActiveChannel(chan.id)}
            className="relative group outline-none"
            title={chan.label}
          >
            <div className={`p-3 rounded-2xl transition-all duration-300 ${activeChannel === chan.id ? (chan.color || 'bg-slate-800 text-white shadow-md') : 'text-slate-400 hover:bg-slate-200/50 hover:text-slate-700'}`}>
              <chan.icon strokeWidth={2.5} size={22} />
            </div>
            {chan.unread > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-slate-50">
                {chan.unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* COLUMN 2: INBOX */}
      <div 
        className="bg-white border-r border-slate-200 flex flex-col flex-shrink-0 relative overflow-hidden"
        style={{ width: inboxWidth, minWidth: '200px', maxWidth: '500px' }}
      >
        <div className="p-4 border-b border-slate-100 min-w-[250px]">
          <h2 className="text-lg font-extrabold text-slate-800 mb-3 tracking-tight">Bandeja</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar cliente..." 
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 outline-none text-slate-700"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {INBOX.filter(i => activeChannel === 'all' || i.channel === activeChannel).map(chat => (
            <div 
              key={chat.id} 
              onClick={() => setActiveChat(chat.id)}
              className={`p-4 border-b border-slate-50 cursor-pointer transition-colors ${activeChat === chat.id ? 'bg-purple-50/50 relative' : 'hover:bg-slate-50'}`}
            >
              {activeChat === chat.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-600 rounded-r-md" />}
              <div className="flex justify-between items-start mb-1">
                <h4 className="font-bold text-slate-800 text-sm truncate pr-2">{chat.name}</h4>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">{chat.time}</span>
              </div>
              <p className="text-xs text-slate-500 truncate mb-2">{chat.preview}</p>
              <div className="flex justify-between items-center">
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                  chat.state === 'Lead Fresco' ? 'bg-blue-100 text-blue-700' :
                  chat.state === 'Cotización' ? 'bg-amber-100 text-amber-700' :
                  chat.state === 'Pendiente por pago' ? 'bg-rose-100 text-rose-700' :
                  'bg-emerald-100 text-emerald-700'
                }`}>
                  {chat.state}
                </span>
                {chat.unread > 0 && (
                  <span className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {chat.unread}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Custom Resize Handle */}
        <div 
          onMouseDown={startDragInbox}
          className="absolute right-0 top-0 bottom-0 w-1.5 hover:bg-purple-400/50 hover:w-2 cursor-col-resize transition-all bg-transparent z-20" 
        />
      </div>

            
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

      {/* COLUMN 4: CRM + AI COPILOT */}
      <div 
        className="bg-slate-50 border-l border-slate-200 flex flex-col relative flex-shrink-0" 
        style={{ width: col4Width }}
      >
        {/* Left Resize Handle */}
        <div 
          onMouseDown={startDragCol4}
          className="absolute left-0 top-0 bottom-0 w-1.5 hover:bg-purple-400/50 hover:w-2 cursor-col-resize transition-all bg-transparent z-20 -ml-[1px]" 
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
            className="h-1.5 w-full bg-transparent cursor-row-resize hover:bg-purple-400/50 hover:h-2 transition-all absolute bottom-0 left-0 right-0 z-20 -mb-[1px]"
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
      
{/* PURCHASES MODAL */}
      {showPurchasesModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                  <ShoppingCart size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg leading-tight">Historial de Compras</h3>
                  <p className="text-xs text-slate-500 font-medium">María Fernanda</p>
                </div>
              </div>
              <button 
                onClick={() => setShowPurchasesModal(false)}
                className="text-slate-400 hover:bg-slate-200 hover:text-slate-700 p-2 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-4">
                {PAST_PURCHASES.map(purchase => (
                  <div key={purchase.id} className="border border-slate-100 rounded-2xl p-4 hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer group">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{purchase.id}</span>
                        <span className="text-xs text-slate-500 font-medium">{purchase.date}</span>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
                        purchase.status === 'Entregado' ? 'bg-emerald-100 text-emerald-700' :
                        purchase.status === 'En tránsito' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {purchase.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <p className="text-sm font-semibold text-slate-700 group-hover:text-indigo-700 transition-colors">{purchase.items}</p>
                      <p className="text-sm font-extrabold text-slate-900">{purchase.total}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                Ver embudo avanzado en Ventas <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUOTATION MODAL */}
      {showQuoteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-purple-50 to-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-600 text-white rounded-lg shadow-sm">
                  <Calculator size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg leading-tight">Cotizador Rápido</h3>
                  <p className="text-xs text-slate-500 font-medium">Motor Financiero TRM</p>
                </div>
              </div>
              <button 
                onClick={() => setShowQuoteModal(false)}
                className="text-slate-400 hover:bg-slate-200 hover:text-slate-700 p-2 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleCalculate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Costo (USD) *</label>
                    <input 
                      type="number" step="0.01" required
                      value={quoteForm.costUsd}
                      onChange={e => setQuoteForm({...quoteForm, costUsd: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
                      placeholder="Ej. 120.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Descuento (%)</label>
                    <input 
                      type="number" step="0.1"
                      value={quoteForm.discount}
                      onChange={e => setQuoteForm({...quoteForm, discount: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Peso (Libras) *</label>
                    <input 
                      type="number" step="0.1" required
                      value={quoteForm.weightLb}
                      onChange={e => setQuoteForm({...quoteForm, weightLb: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">TRM del día *</label>
                    <input 
                      type="number" step="0.01" required
                      value={quoteForm.trm}
                      onChange={e => setQuoteForm({...quoteForm, trm: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
                    />
                  </div>
                </div>
                
                <button 
                  type="submit" 
                  disabled={isCalculating}
                  className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-purple-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-4"
                >
                  {isCalculating ? 'Calculando...' : 'Calcular Precio Sugerido'} <ArrowRight size={16} />
                </button>
              </form>

              {quoteResult && (
                <div className="mt-6 border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-extrabold text-slate-800 mb-4 text-center uppercase tracking-wide">Resultados (COP)</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Costo Total</p>
                      <p className="text-lg font-extrabold text-slate-700">
                        ${quoteResult.total_cost_cop?.toLocaleString('es-CO')}
                      </p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-2xl border border-purple-200 text-center shadow-sm relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 to-transparent pointer-events-none" />
                      <p className="text-[10px] font-bold text-purple-600 uppercase mb-1">Precio Sugerido</p>
                      <p className="text-xl font-black text-purple-700">
                        ${quoteResult.suggested_price_cop?.toLocaleString('es-CO')}
                      </p>
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 text-center">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Anticipo</p>
                      <p className="text-lg font-extrabold text-emerald-700">
                        ${quoteResult.advance_payment_cop?.toLocaleString('es-CO')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex gap-2">
                    <button 
                      onClick={() => {
                        alert('Se anexaría la cotización al chat');
                        setShowQuoteModal(false);
                      }}
                      className="flex-1 bg-slate-800 text-white font-bold py-2.5 rounded-xl hover:bg-slate-900 transition-colors text-sm"
                    >
                      Adjuntar Cotización al Chat
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
