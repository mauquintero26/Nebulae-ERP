"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Globe, Wand2, ExternalLink, RefreshCw, Check, X, Send,
  Image, Type, Package, Phone, MessageSquare, Palette,
  ChevronRight, Eye, Settings, Layers, FileText, ShoppingBag,
  AlertCircle, CheckCircle2, Sparkles, Monitor, Tablet, Smartphone,
  Save, Undo, Layout, Edit3, User, Mail, MapPin, Star
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || e.message || r.statusText); }
  return r.json();
}

function Toast({ msg, type, onClose }: { msg: string; type: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-8 right-8 z-[100] flex items-center gap-3 ${type === 'ok' ? 'bg-emerald-600' : 'bg-red-600'} text-white px-5 py-3 rounded-2xl shadow-2xl`}>
      {type === 'ok' ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}
      <span className="font-semibold text-sm">{msg}</span>
      <button onClick={onClose}><X size={14}/></button>
    </div>
  );
}

// Chat Message component
function ChatMessage({ msg }: { msg: { role: string; text: string; changes?: any; timestamp: Date } }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-purple-600 text-white' : 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white'}`}>
        {isUser ? <User size={14}/> : <Sparkles size={14}/>}
      </div>
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${isUser ? 'bg-purple-600 text-white rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'}`}>
          {msg.text}
        </div>
        {msg.changes && Object.keys(msg.changes).length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs text-emerald-700 font-medium flex items-center gap-2">
            <Check size={12}/> Cambios aplicados: {Object.keys(msg.changes).join(', ')}
          </div>
        )}
        <span className="text-[10px] text-gray-400">{msg.timestamp.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

// Section config panels
function HeroPanel({ config, onChange }: { config: any; onChange: (v: any) => void }) {
  const c = config || {};
  return (
    <div className="space-y-3 p-4">
      <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">Sección Hero / Banner</h3>
      <div><label className="block text-xs font-semibold text-gray-600 mb-1">Título Principal</label>
        <input value={c.title||''} onChange={e => onChange({...c, title: e.target.value})} placeholder="Bienvenido a Nebulae" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
      <div><label className="block text-xs font-semibold text-gray-600 mb-1">Subtítulo</label>
        <input value={c.subtitle||''} onChange={e => onChange({...c, subtitle: e.target.value})} placeholder="Productos de calidad para ti" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
      <div><label className="block text-xs font-semibold text-gray-600 mb-1">Texto del Botón CTA</label>
        <input value={c.cta_text||''} onChange={e => onChange({...c, cta_text: e.target.value})} placeholder="Comprar Ahora" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
      <div><label className="block text-xs font-semibold text-gray-600 mb-1">URL Imagen de Fondo</label>
        <input value={c.bg_image||''} onChange={e => onChange({...c, bg_image: e.target.value})} placeholder="https://..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
    </div>
  );
}

function ContactPanel({ config, onChange }: { config: any; onChange: (v: any) => void }) {
  const c = config || {};
  return (
    <div className="space-y-3 p-4">
      <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">Información de Contacto</h3>
      {[['phone','Teléfono',Phone],['whatsapp','WhatsApp',MessageSquare],['email','Email',Mail],['address','Dirección',MapPin]].map(([k, l, Icon]: any) => (
        <div key={k}><label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Icon size={10}/>{l}</label>
          <input value={c[k]||''} onChange={e => onChange({...c, [k]: e.target.value})} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
      ))}
    </div>
  );
}

function ThemePanel({ config, onChange }: { config: any; onChange: (v: any) => void }) {
  const c = config || {};
  return (
    <div className="space-y-3 p-4">
      <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">Tema / Colores</h3>
      <div><label className="block text-xs font-semibold text-gray-600 mb-1">Color Principal</label>
        <div className="flex items-center gap-2"><input type="color" value={c.primary||'#6C3EC0'} onChange={e => onChange({...c, primary: e.target.value})} className="w-10 h-10 rounded-xl border border-gray-200 cursor-pointer"/><span className="text-xs text-gray-500">{c.primary||'#6C3EC0'}</span></div></div>
      <div><label className="block text-xs font-semibold text-gray-600 mb-1">Color Acento</label>
        <div className="flex items-center gap-2"><input type="color" value={c.accent||'#9F7AEA'} onChange={e => onChange({...c, accent: e.target.value})} className="w-10 h-10 rounded-xl border border-gray-200 cursor-pointer"/><span className="text-xs text-gray-500">{c.accent||'#9F7AEA'}</span></div></div>
    </div>
  );
}

// Main Web Builder Page
export default function SitioWebPage() {
  const [toast, setToast] = useState<{msg: string; type: string}|null>(null);
  const showToast = (msg: string, type = 'ok') => setToast({msg, type});

  const [activeSection, setActiveSection] = useState<string|null>('hero');
  const [viewDevice, setViewDevice] = useState<'desktop'|'tablet'|'mobile'>('desktop');
  const [chatMessages, setChatMessages] = useState<any[]>([
    { role: 'ai', text: '¡Hola! Soy tu asistente de diseño web. Puedo ayudarte a personalizar tu tienda. Prueba decirme:\n• "Cambia el título del hero a Nebulae Kids"\n• "Agrega un WhatsApp +57 300 123 4567"\n• "Cambia el color principal a azul"', timestamp: new Date(), changes: {} }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  useEffect(() => {
    apiFetch('/ecommerce/web-builder/config').then(d => { setConfig(d.data || {}); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const updateSection = useCallback((section: string, value: any) => {
    setConfig(c => ({ ...c, [section]: value }));
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await apiFetch('/ecommerce/web-builder/config', { method: 'PATCH', body: JSON.stringify(config) });
      showToast('Cambios guardados y aplicados en la tienda', 'ok');
    } catch (e: any) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput('');
    setSending(true);

    const userMsg = { role: 'user', text, timestamp: new Date(), changes: {} };
    setChatMessages(prev => [...prev, userMsg]);

    try {
      const d = await apiFetch('/ecommerce/web-builder/chat', { method: 'POST', body: JSON.stringify({ instruction: text, current_config: config }) });
      const { response, changes, applied } = d.data || {};

      if (applied && changes) {
        setConfig(prev => ({ ...prev, ...changes }));
        // Auto-save after AI changes
        setTimeout(() => apiFetch('/ecommerce/web-builder/config', { method: 'PATCH', body: JSON.stringify({ ...config, ...changes }) }).catch(() => {}), 500);
      }

      setChatMessages(prev => [...prev, { role: 'ai', text: response || 'Cambio aplicado.', timestamp: new Date(), changes: changes || {} }]);
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Lo siento, hubo un error procesando tu instrucción. Intenta de nuevo.', timestamp: new Date(), changes: {} }]);
    }
    setSending(false);
  };

  const SECTIONS = [
    { k: 'hero', l: 'Hero / Banner', icon: <Layout size={15}/> },
    { k: 'contact', l: 'Contacto', icon: <Phone size={15}/> },
    { k: 'theme', l: 'Tema / Colores', icon: <Palette size={15}/> },
    { k: 'featured_section', l: 'Productos Destacados', icon: <Star size={15}/> },
  ];

  const iframeWidth = viewDevice === 'desktop' ? '100%' : viewDevice === 'tablet' ? '768px' : '375px';

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)}/>}

      {/* Top Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-purple-600 text-white p-2 rounded-xl"><Globe size={18}/></div>
          <div>
            <h1 className="font-black text-gray-900 text-lg leading-none">Sitio Web</h1>
            <p className="text-xs text-gray-400">Editor visual de la tienda pública</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Device preview toggle */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1">
            {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
              <button key={d} onClick={() => setViewDevice(d)} className={`p-2 rounded-lg transition-colors ${viewDevice === d ? 'bg-white shadow text-purple-700' : 'text-gray-500 hover:text-gray-700'}`}>
                <Icon size={16}/>
              </button>
            ))}
          </div>
          <Link href="/store" target="_blank" className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm">
            <ExternalLink size={14}/> Ver Tienda
          </Link>
          <button onClick={saveConfig} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm disabled:opacity-50">
            {saving ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>} Guardar Cambios
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* LEFT: Section Config Panels */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Secciones</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* Section list */}
            <div className="p-2 space-y-1 border-b border-gray-100">
              {SECTIONS.map(s => (
                <button key={s.k} onClick={() => setActiveSection(activeSection === s.k ? null : s.k)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeSection === s.k ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className={activeSection === s.k ? 'text-purple-600' : 'text-gray-400'}>{s.icon}</span>
                  {s.l}
                  <ChevronRight size={13} className={`ml-auto transition-transform ${activeSection === s.k ? 'rotate-90' : ''}`}/>
                </button>
              ))}
            </div>

            {/* Active section panel */}
            {activeSection === 'hero' && <HeroPanel config={config.hero} onChange={v => updateSection('hero', v)}/>}
            {activeSection === 'contact' && <ContactPanel config={config.contact} onChange={v => updateSection('contact', v)}/>}
            {activeSection === 'theme' && <ThemePanel config={config.theme} onChange={v => updateSection('theme', v)}/>}
            {activeSection === 'featured_section' && (
              <div className="space-y-3 p-4">
                <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">Productos Destacados</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={config.featured_section?.enabled||false} onChange={e => updateSection('featured_section', {...(config.featured_section||{}), enabled: e.target.checked})} className="rounded border-gray-300 text-purple-600"/>
                  <span className="text-sm font-semibold text-gray-700">Mostrar en la landing</span>
                </label>
                <div><label className="block text-xs font-semibold text-gray-600 mb-1">Título Sección</label>
                  <input value={config.featured_section?.title||''} onChange={e => updateSection('featured_section',{...config.featured_section,title:e.target.value})} placeholder="Productos Destacados" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
                <div><label className="block text-xs font-semibold text-gray-600 mb-1">Filtrar por Categoría</label>
                  <input value={config.featured_section?.categoria||''} onChange={e => updateSection('featured_section',{...config.featured_section,categoria:e.target.value})} placeholder="Ej: Ropa, Bebé..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
                <div><label className="block text-xs font-semibold text-gray-600 mb-1">Número de productos</label>
                  <input type="number" min={2} max={20} value={config.featured_section?.limit||8} onChange={e => updateSection('featured_section',{...config.featured_section,limit:Number(e.target.value)})} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
              </div>
            )}

            {/* Quick actions */}
            <div className="p-4 border-t border-gray-100 mt-4">
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Acciones Rápidas</p>
              <div className="space-y-2">
                <Link href="/store" target="_blank" className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl text-sm text-gray-600 hover:bg-gray-100 font-medium"><Eye size={14}/> Vista previa tienda</Link>
                <Link href="/dashboard/ecommerce" className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl text-sm text-gray-600 hover:bg-gray-100 font-medium"><Package size={14}/> Catálogo Digital</Link>
                <Link href="/store/blog" target="_blank" className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl text-sm text-gray-600 hover:bg-gray-100 font-medium"><FileText size={14}/> Blog</Link>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER: Live Preview */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-200 min-w-0">
          <div className="flex items-center justify-center py-2 bg-gray-100 border-b border-gray-300">
            <div className="flex items-center gap-2 bg-white rounded-full px-4 py-1.5 shadow-sm border border-gray-200">
              <div className="w-2 h-2 rounded-full bg-red-400"/>
              <div className="w-2 h-2 rounded-full bg-yellow-400"/>
              <div className="w-2 h-2 rounded-full bg-green-400"/>
              <span className="text-xs text-gray-500 ml-2 font-mono">nebulaekids.com</span>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-start justify-center p-4">
            <div style={{ width: iframeWidth, maxWidth: '100%' }} className="bg-white rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
              <iframe src="/store" className="w-full" style={{ height: '700px', border: 'none' }} title="Vista previa tienda"/>
            </div>
          </div>
        </div>

        {/* RIGHT: AI Chat */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-indigo-50">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white p-2 rounded-xl"><Wand2 size={16}/></div>
              <div>
                <h3 className="font-black text-gray-900 text-sm">Agente de Diseño IA</h3>
                <p className="text-[10px] text-gray-500">Describe cambios en lenguaje natural</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {chatMessages.map((m, i) => <ChatMessage key={i} msg={m}/>)}
            {sending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shrink-0"><Sparkles size={14} className="text-white"/></div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}/>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}/>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}/>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100 bg-white">
            <div className="flex gap-2">
              <textarea
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="Describe un cambio... (Enter para enviar)"
                rows={2}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200 resize-none"
              />
              <button onClick={sendChat} disabled={!chatInput.trim() || sending} className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl disabled:opacity-40 transition-colors self-end">
                <Send size={16}/>
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 text-center">Ejemplos: "Cambia el título hero" · "Agrega WhatsApp" · "Modifica el color"</p>
          </div>
        </div>
      </div>
    </div>
  );
}
