
import os
with open("src/components/GlobalAIChat.tsx", "w", encoding="utf-8") as f:
    f.write(""""use client";

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X, Send, Bot, Minimize2, Maximize2, Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';

export function GlobalAIChat() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<{role: 'ai'|'user', text: string}[]>([
    { role: 'ai', text: '¡Hola! Soy Nebulae AI, tu agente MCP. Conectado al servidor de producción. ¿En qué te puedo asistir hoy?' }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);

  const getModuleName = () => {
    if (!pathname) return 'General';
    if (pathname.includes('/ventas')) return 'Ventas & CRM';
    if (pathname.includes('/compras')) return 'Compras & Logística';
    if (pathname.includes('/inventario')) return 'Inventario';
    if (pathname.includes('/marketing')) return 'Marketing';
    if (pathname.includes('/admin')) return 'Administración';
    if (pathname.includes('/integraciones')) return 'Integraciones MCP';
    return 'General';
  };

  const moduleName = getModuleName();

  useEffect(() => {
    // Scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // WebSocket Connection
  useEffect(() => {
    const socket = new WebSocket('wss://api.nebulaekids.com/ws/chat');
    
    socket.onopen = () => {
      console.log('Conectado a Nebulae AI Production');
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages(prev => [...prev, { role: 'ai', text: data.message || event.data }]);
      } catch(e) {
        setMessages(prev => [...prev, { role: 'ai', text: event.data }]);
      }
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;
    
    // Add user message to UI
    setMessages(prev => [...prev, { role: 'user', text: input }]);
    
    // Send to WS
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        context: moduleName, 
        message: input 
      }));
    } else {
      toast.error('Conexión con IA perdida. Intentando reconectar...');
      // Simulamos que al menos muestra algo de error local
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'ai', text: 'Error: No se pudo contactar al MCP Agent de producción.' }]);
      }, 500);
    }
    
    setInput('');
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:scale-110 transition-transform z-50 group"
      >
        <Sparkles className="text-white group-hover:animate-spin-slow" size={24} />
        <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></span>
      </button>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden transition-all duration-300 ${isExpanded ? 'w-[600px] h-[80vh]' : 'w-[380px] h-[550px]'}`}>
      
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-inner relative">
            <Bot className="text-white" size={20} />
            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-slate-800 rounded-full ${ws?.readyState === WebSocket.OPEN ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
          </div>
          <div>
            <h3 className="font-black text-white text-sm">Nebulae Copilot</h3>
            <p className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 uppercase tracking-wider">
              <span className={`w-1.5 h-1.5 rounded-full ${ws?.readyState === WebSocket.OPEN ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`}></span> MCP Online: {moduleName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors">
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-slate-700 hover:text-red-400 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-50 flex flex-col gap-4 custom-scrollbar">
        <div className="text-center mb-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-200 px-2 py-1 rounded-full">Prod. Server Conectado</span>
        </div>
        
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'ai' && (
              <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 shrink-0 mr-2 mt-1">
                <Sparkles size={12} />
              </div>
            )}
            <div className={`px-4 py-2.5 rounded-2xl max-w-[80%] text-sm ${
              msg.role === 'user' 
                ? 'bg-slate-800 text-white rounded-br-none' 
                : 'bg-white border border-slate-200 text-slate-700 shadow-sm rounded-bl-none font-medium'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-200 shrink-0">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100 transition-all">
          <button className="text-slate-400 hover:text-purple-600 transition-colors p-1">
            <Paperclip size={18} />
          </button>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={`Hablar con IA en ${moduleName}...`}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 outline-none px-2"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-8 h-8 bg-purple-600 disabled:bg-slate-300 text-white rounded-lg flex items-center justify-center transition-colors shadow-sm"
          >
            <Send size={14} className={input.trim() ? "ml-0.5" : ""} />
          </button>
        </div>
      </div>

    </div>
  );
}
""")
