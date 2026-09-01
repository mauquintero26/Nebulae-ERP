'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, RefreshCw, X, Bot, CheckCheck } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

interface Message {
  id: number;
  direction: 'in' | 'out';
  content: string;
  sender_name: string;
  created_at: string;
  is_ai_generated?: boolean;
}

export default function WebChatPage() {
  const [step, setStep] = useState<'form' | 'chat'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [lastTs, setLastTs] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for new messages every 2.5s
  useEffect(() => {
    if (!sessionToken) return;
    pollRef.current = setInterval(async () => {
      try {
        const q = lastTs ? `?since=${encodeURIComponent(lastTs)}` : '';
        const r = await fetch(`${API}/chat/web/messages/${sessionToken}${q}`);
        const d = await r.json();
        const newMsgs = d.data || [];
        if (newMsgs.length > 0) {
          setMessages(prev => [...prev, ...newMsgs]);
          setLastTs(newMsgs[newMsgs.length - 1].created_at);
        }
      } catch { }
    }, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionToken, lastTs]);

  async function startChat(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setStarting(true);
    try {
      const r = await fetch(`${API}/chat/web/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: name.trim(), customer_email: email.trim() || undefined }),
      });
      const d = await r.json();
      const data = d.data || d;
      setSessionToken(data.session_token);
      setConvId(data.conversation_id);
      // Load initial messages
      const mr = await fetch(`${API}/chat/web/messages/${data.session_token}`);
      const md = await mr.json();
      const msgs = md.data || [];
      setMessages(msgs);
      if (msgs.length) setLastTs(msgs[msgs.length - 1].created_at);
      setStep('chat');
    } catch (e: any) {
      alert('Error conectando con el chat: ' + e.message);
    }
    setStarting(false);
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || sending || !sessionToken) return;
    const content = input.trim();
    setInput('');
    setSending(true);
    // Optimistic message
    const opt: Message = { id: Date.now(), direction: 'in', content, sender_name: name, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, opt]);
    try {
      const r = await fetch(`${API}/chat/web/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: sessionToken, content }),
      });
      const d = await r.json();
      // Update optimistic with real data
      const real = d.data;
      if (real) {
        setMessages(prev => prev.map(m => m.id === opt.id ? { ...opt, id: real.id, created_at: real.created_at } : m));
        setLastTs(real.created_at);
      }
      // If auto-reply came back immediately
      if (d.ai_reply) {
        setMessages(prev => [...prev, d.ai_reply]);
        setLastTs(d.ai_reply.created_at);
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== opt.id));
    }
    setSending(false);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  // ── FORM ──────────────────────────────────────────────────────────────
  if (step === 'form') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <MessageCircle size={32} className="text-white"/>
            </div>
            <h1 className="text-xl font-extrabold">Nebulae Kids</h1>
            <p className="text-indigo-200 text-sm mt-1">Chat de soporte en línea</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"/>
              <span className="text-xs text-emerald-300 font-semibold">Agente disponible</span>
            </div>
          </div>

          <form onSubmit={startChat} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Tu nombre *</label>
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej. María García"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Tu email (opcional)</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none bg-slate-50"
              />
            </div>
            <button
              type="submit"
              disabled={starting || !name.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md shadow-indigo-200"
            >
              {starting ? <><RefreshCw size={16} className="animate-spin"/> Conectando...</> : <><MessageCircle size={16}/> Iniciar chat</>}
            </button>
            <p className="text-[10px] text-slate-400 text-center">Al iniciar el chat aceptas nuestra política de privacidad.</p>
          </form>
        </div>
      </div>
    );
  }

  // ── CHAT ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-end justify-center p-4 sm:items-center">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style={{ height: '85vh', maxHeight: '640px' }}>
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4 text-white flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <Bot size={20} className="text-white"/>
          </div>
          <div className="flex-1">
            <p className="font-extrabold text-sm">Nebulae Kids</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"/>
              <span className="text-[10px] text-indigo-200">En línea — respondemos en minutos</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.direction === 'in' ? 'justify-end' : 'justify-start'}`}>
              {msg.direction === 'out' && (
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center mr-2 flex-shrink-0 mt-auto">
                  <Bot size={13} className="text-white"/>
                </div>
              )}
              <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 shadow-sm ${
                msg.direction === 'in'
                  ? 'bg-indigo-600 text-white rounded-br-none'
                  : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'
              }`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                <div className={`flex items-center justify-end gap-1 text-[9px] mt-1 ${msg.direction === 'in' ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {formatTime(msg.created_at)}
                  {msg.direction === 'in' && <CheckCheck size={11}/>}
                </div>
              </div>
            </div>
          ))}
          <div ref={endRef}/>
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="p-4 bg-white border-t border-slate-200 flex-shrink-0">
          <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
            <textarea
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Escribe tu mensaje..."
              className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-2 text-sm text-slate-700 outline-none max-h-24"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors flex-shrink-0"
            >
              {sending ? <RefreshCw size={16} className="animate-spin"/> : <Send size={16}/>}
            </button>
          </div>
          <p className="text-[9px] text-slate-400 text-center mt-2">Powered by Nebulae ERP • Chat seguro</p>
        </form>
      </div>
    </div>
  );
}
