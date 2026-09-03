'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageCircle, Globe, LayoutGrid, Search, MoreVertical, Send,
  Paperclip, CheckCheck, Bot, Sparkles, FileText, ChevronRight,
  X, Calculator, ArrowRight, Phone, RefreshCw, Plus,
  MoveRight, ShoppingCart, User, AlertCircle,
  ExternalLink, Circle, Check, UserPlus, Camera
} from 'lucide-react';
import { calculateQuotation } from '@/lib/api';

// Brand icons (lucide-react has no brand icons)
const IGIcon = ({ size = 22, className = '', style = {} }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
  </svg>
);
const FBIcon = ({ size = 22, className = '', style = {} }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
);

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string, string> || {}),
  };
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

const CHANNEL_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
  all:       { label: 'Todos',     color: '#6366f1', bg: '#eef2ff', Icon: LayoutGrid },
  web:       { label: 'Web Chat',  color: '#0ea5e9', bg: '#f0f9ff', Icon: Globe },
  whatsapp:  { label: 'WhatsApp',  color: '#25d366', bg: '#f0fdf4', Icon: MessageCircle },
  instagram: { label: 'Instagram', color: '#e1306c', bg: '#fdf2f8', Icon: IGIcon },
  facebook:  { label: 'Facebook',  color: '#1877f2', bg: '#eff6ff', Icon: FBIcon },
};

const SOLICITUD_TIPOS = [
  'Nuevo Lead', 'Solicitud de Cliente', 'Cotizacion',
  'Pendiente de Pago', 'Pedido de Venta',
];

// Font sizes: use style={{ fontSize: N }} - never text-${var} (Tailwind can't purge dynamic classes)
type FontSize = 'sm' | 'md' | 'lg';
const FS: Record<FontSize, { name: number; sub: number; preview: number; badge: number }> = {
  sm: { name: 11, sub: 10, preview: 10, badge: 9  },
  md: { name: 12, sub: 11, preview: 11, badge: 10 },
  lg: { name: 14, sub: 12, preview: 13, badge: 11 },
};

const STAGE_COLORS: Record<string, string> = {
  'bg-blue-500':'#3b82f6','bg-purple-500':'#a855f7','bg-amber-500':'#f59e0b',
  'bg-rose-500':'#f43f5e','bg-emerald-500':'#10b981','bg-indigo-500':'#6366f1',
  'bg-slate-500':'#64748b','bg-orange-500':'#f97316',
};
function stageColor(s: any) { return STAGE_COLORS[s?.color] || '#6366f1'; }

function formatTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'ahora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}
function initials(name: string) {
  return (name || 'V').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
}

function FontSizePicker({ value, onChange }: { value: FontSize; onChange: (v: FontSize) => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5" title="Tamano de texto">
      {(['sm', 'md', 'lg'] as FontSize[]).map(sz => (
        <button key={sz} onClick={() => onChange(sz)}
          className={`px-2 py-1 rounded-md transition-all font-black ${value === sz ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          style={{ fontSize: sz === 'sm' ? 9 : sz === 'md' ? 11 : 13 }}>
          A
        </button>
      ))}
    </div>
  );
}

export default function AsistenteOmnicanal() {
  const [inboxWidth, setInboxWidth] = useState(300);
  const [col4Width, setCol4Width]   = useState(380);
  const [crmHeight, setCrmHeight]   = useState(430);

  // Stories catalog state
  const [storyCatalog, setStoryCatalog] = useState<any[]>([]);
  const [storyCatalogLoading, setStoryCatalogLoading] = useState(false);
  const [storyTab, setStoryTab] = useState<'crm'|'historias'>('crm');

  const [inboxFontSize, setInboxFontSize] = useState<FontSize>('md');
  const [crmFontSize, setCrmFontSize]     = useState<FontSize>('md');
  useEffect(() => {
    const i = localStorage.getItem('omni_inbox_font') as FontSize;
    const c = localStorage.getItem('omni_crm_font') as FontSize;
    if (i) setInboxFontSize(i);
    if (c) setCrmFontSize(c);
  }, []);
  const changeInboxFont = (v: FontSize) => { setInboxFontSize(v); localStorage.setItem('omni_inbox_font', v); };
  const changeCrmFont   = (v: FontSize) => { setCrmFontSize(v);   localStorage.setItem('omni_crm_font', v); };

  const [currentUser, setCurrentUser] = useState('');
  const [showMyLeads, setShowMyLeads] = useState(false);

  const [activeChannel, setActiveChannel] = useState('all');
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConvId, setActiveConvId]   = useState<number | null>(null);
  const [activeConv, setActiveConv]       = useState<any>(null);
  const [loadingConvs, setLoadingConvs]   = useState(true);
  const [searchInbox, setSearchInbox]     = useState('');

  const [messages, setMessages]       = useState<any[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [inputText, setInputText]     = useState('');
  const [sending, setSending]         = useState(false);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [aiMode, setAiMode]             = useState<'auto'|'suggestion'|'off'>('suggestion');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [loadingAI, setLoadingAI]       = useState(false);

  const [crmStages, setCrmStages]       = useState<any[]>([]);
  const [crmLeads, setCrmLeads]         = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);

  const [selectedLead, setSelectedLead]   = useState<any>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [editForm, setEditForm]           = useState<any>({});
  const [savingLead, setSavingLead]       = useState(false);
  const [movingStage, setMovingStage]     = useState(false);

  const [showNewLead, setShowNewLead]   = useState(false);
  const [newLeadForm, setNewLeadForm]   = useState<any>({
    solicitud_tipo: 'Nuevo Lead',
    lead_product_name: '',
    lead_value: '',
    lead_description: '',
    advisor_name: '',
    pipeline_stage_id: '',
    customer_id: null as number | null,
    customer_search: '',
  });
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showCustomerList, setShowCustomerList]   = useState(false);
  const [savingNew, setSavingNew]     = useState(false);
  const [newLeadError, setNewLeadError] = useState('');

  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteForm, setQuoteForm]           = useState({ costUsd:'', discount:'0', weightLb:'1', trm:'4200' });
  const [quoteResult, setQuoteResult]       = useState<any>(null);
  const [isCalculating, setIsCalculating]   = useState(false);

  const pollInboxRef  = useRef<NodeJS.Timeout | null>(null);
  const pollMsgsRef   = useRef<NodeJS.Timeout | null>(null);
  const lastMsgTsRef  = useRef<string | null>(null);
  const sentMsgIdsRef = useRef<Set<number>>(new Set());
  const custSearchTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const u = localStorage.getItem('user_name') || localStorage.getItem('username') || '';
    setCurrentUser(u);
  }, []);

  // Load story catalog for omnicanal col4
  const loadStoryCatalog = useCallback(async () => {
    setStoryCatalogLoading(true);
    try {
      const d = await apiFetch('/marketing/story-catalog?activo=true');
      setStoryCatalog(Array.isArray(d) ? d : (d.data || []));
    } catch { setStoryCatalog([]); }
    setStoryCatalogLoading(false);
  }, []);

  useEffect(() => { if (storyTab === 'historias') loadStoryCatalog(); }, [storyTab, loadStoryCatalog]);

  useEffect(() => {
    apiFetch('/crm/pipeline-stages/config')
      .then(d => {
        const arr = Array.isArray(d) ? d : (d?.data ?? []);
        setCrmStages(arr);
        if (arr.length > 0) setNewLeadForm((f: any) => ({ ...f, pipeline_stage_id: arr[0].id }));
      }).catch(() => {});
  }, []);

  function onCustomerSearch(q: string) {
    setNewLeadForm((f: any) => ({ ...f, customer_search: q, customer_id: null }));
    setShowCustomerList(true);
    if (custSearchTimer.current) clearTimeout(custSearchTimer.current);
    if (!q.trim()) { setCustomerResults([]); return; }
    setSearchingCustomer(true);
    custSearchTimer.current = setTimeout(async () => {
      try {
        const d = await apiFetch(`/crm/customers/search?q=${encodeURIComponent(q)}`);
        setCustomerResults(Array.isArray(d) ? d : (d?.data ?? []));
      } catch { setCustomerResults([]); }
      finally { setSearchingCustomer(false); }
    }, 300);
  }

  function selectCustomer(c: any) {
    setNewLeadForm((f: any) => ({
      ...f,
      customer_id: c.id,
      customer_search: c.full_name || `${c.first_name} ${c.last_name}`,
    }));
    setShowCustomerList(false);
    setCustomerResults([]);
  }

  const loadConversations = useCallback(async () => {
    try {
      const ch = activeChannel === 'all' ? '' : activeChannel;
      const q  = ch ? `?channel=${ch}` : '';
      const d  = await apiFetch(`/chat/conversations${q}`);
      const arr = Array.isArray(d) ? d : (d?.data ?? []);
      setConversations(arr);
      if (arr.length > 0 && !activeConvId) setActiveConvId(arr[0].id);
    } catch { } finally { setLoadingConvs(false); }
  }, [activeChannel, activeConvId]);

  useEffect(() => {
    setLoadingConvs(true);
    loadConversations();
    if (pollInboxRef.current) clearInterval(pollInboxRef.current);
    pollInboxRef.current = setInterval(loadConversations, 5000);
    return () => { if (pollInboxRef.current) clearInterval(pollInboxRef.current); };
  }, [activeChannel]);

  const loadMessages = useCallback(async (convId: number, since: string | null = null) => {
    try {
      const q = since ? `?since=${encodeURIComponent(since)}` : '';
      const d = await apiFetch(`/chat/conversations/${convId}/messages${q}`);
      const msgs: any[] = d?.messages ?? [];
      const conv = d?.conversation ?? null;
      if (since) {
        if (msgs.length > 0) {
          const fresh = msgs.filter(m => !sentMsgIdsRef.current.has(m.id));
          if (fresh.length > 0) {
            setMessages(prev => [...prev.filter(p => typeof p.id !== 'number' || p.id < 1e15), ...fresh]);
            lastMsgTsRef.current = msgs[msgs.length - 1].created_at;
          }
        }
      } else {
        setMessages(msgs);
        lastMsgTsRef.current = msgs.length > 0 ? msgs[msgs.length - 1].created_at : null;
      }
      if (conv) { setActiveConv(conv); setAiMode(conv.ai_mode || 'suggestion'); }
    } catch { }
  }, []);

  useEffect(() => {
    if (!activeConvId) return;
    sentMsgIdsRef.current.clear();
    setLoadingMsgs(true);
    lastMsgTsRef.current = null;
    loadMessages(activeConvId).finally(() => setLoadingMsgs(false));
    if (pollMsgsRef.current) clearInterval(pollMsgsRef.current);
    pollMsgsRef.current = setInterval(() => loadMessages(activeConvId, lastMsgTsRef.current), 3000);
    return () => { if (pollMsgsRef.current) clearInterval(pollMsgsRef.current); };
  }, [activeConvId]);

  const loadCrmLeads = useCallback(async (customerId?: number) => {
    if (!customerId) { setCrmLeads([]); return; }
    setLoadingLeads(true);
    try {
      const adv = showMyLeads && currentUser ? `&advisor_name=${encodeURIComponent(currentUser)}` : '';
      const d = await apiFetch(`/crm/leads?customer_id=${customerId}${adv}&limit=100`);
      setCrmLeads(Array.isArray(d) ? d : (d?.data ?? []));
    } catch { setCrmLeads([]); }
    finally { setLoadingLeads(false); }
  }, [showMyLeads, currentUser]);

  useEffect(() => { loadCrmLeads(activeConv?.customer_id); }, [activeConv?.customer_id, showMyLeads]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const inMsgCount = messages.filter(m => m.direction === 'in').length;
  useEffect(() => {
    if (!activeConvId || aiMode === 'off' || inMsgCount === 0) { setAiSuggestion(''); return; }
    const t = setTimeout(() => {
      setLoadingAI(true);
      apiFetch(`/chat/conversations/${activeConvId}/ai-suggest`, { method: 'POST', body: JSON.stringify({}) })
        .then(d => setAiSuggestion(d?.suggestion || ''))
        .catch(() => setAiSuggestion(''))
        .finally(() => setLoadingAI(false));
    }, 800);
    return () => clearTimeout(t);
  }, [activeConvId, inMsgCount, aiMode]);

  async function sendMessage() {
    if (!inputText.trim() || !activeConvId || sending) return;
    const content = inputText.trim();
    setInputText('');
    setSending(true);
    const tempId = Date.now() + Math.random();
    setMessages(prev => [...prev, { id: tempId, direction: 'out', content, sender_name: 'Asesor', created_at: new Date().toISOString() }]);
    try {
      const d = await apiFetch(`/chat/conversations/${activeConvId}/reply`, {
        method: 'POST', body: JSON.stringify({ content }),
      });
      sentMsgIdsRef.current.add(d.id);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...d } : m));
      setConversations(prev => prev.map(c => c.id === activeConvId
        ? { ...c, last_message: content, last_message_at: new Date().toISOString() } : c));
    } catch { setMessages(prev => prev.filter(m => m.id !== tempId)); }
    setSending(false);
  }

  async function toggleAiMode(mode: 'auto' | 'suggestion' | 'off') {
    setAiMode(mode);
    if (!activeConvId) return;
    await apiFetch(`/chat/conversations/${activeConvId}/ai-mode`, {
      method: 'PATCH', body: JSON.stringify({ mode }),
    }).catch(() => {});
  }

  async function createNewLead(e: React.FormEvent) {
    e.preventDefault();
    setNewLeadError('');
    let customerId = activeConv?.customer_id || newLeadForm.customer_id;
    if (!customerId) {
      setNewLeadError('Selecciona un cliente de la lista para continuar.');
      return;
    }
    setSavingNew(true);
    try {
      if (!activeConv?.customer_id && activeConvId) {
        await apiFetch(`/chat/conversations/${activeConvId}/link-customer`, {
          method: 'PATCH', body: JSON.stringify({ customer_id: customerId }),
        });
        setActiveConv((prev: any) => ({ ...prev, customer_id: customerId }));
        setConversations(prev => prev.map(c => c.id === activeConvId
          ? { ...c, customer_id: customerId, customer_name: newLeadForm.customer_search } : c));
      }
      const stageId = newLeadForm.pipeline_stage_id ? Number(newLeadForm.pipeline_stage_id) : undefined;
      const body: any = {
        customer_id: customerId,
        solicitud_tipo: newLeadForm.solicitud_tipo,
        lead_product_name: newLeadForm.lead_product_name.trim(),
        lead_value: Number(newLeadForm.lead_value) || 0,
        description: newLeadForm.lead_description.trim(),
        advisor_name: (newLeadForm.advisor_name || currentUser || '').trim(),
        lead_source: 'Omnicanal',
        sale_type: 'ON_DEMAND',
      };
      if (stageId) body.pipeline_stage_id = stageId;
      const newLead = await apiFetch('/crm/leads', { method: 'POST', body: JSON.stringify(body) });
      const leadData = newLead?.data ?? newLead;
      setCrmLeads(prev => [leadData, ...prev]);
      setShowNewLead(false);
      setNewLeadForm({
        solicitud_tipo: 'Nuevo Lead', lead_product_name: '', lead_value: '',
        lead_description: '', advisor_name: currentUser,
        pipeline_stage_id: crmStages[0]?.id || '',
        customer_id: null, customer_search: '',
      });
      await loadCrmLeads(customerId);
    } catch (err: any) { setNewLeadError(err.message || 'Error al crear la solicitud.'); }
    setSavingNew(false);
  }

  function openLead(lead: any) {
    setSelectedLead(lead);
    setEditForm({
      solicitud_tipo:    lead.solicitud_tipo || 'Nuevo Lead',
      lead_product_name: lead.lead_product_name || '',
      lead_value:        lead.value ?? lead.lead_value ?? 0,
      lead_description:  lead.description || lead.lead_description || '',
      advisor_name:      lead.advisor_name || '',
      pipeline_stage_id: lead.pipeline_stage_id || '',
    });
    setShowLeadModal(true);
  }

  async function saveLead() {
    if (!selectedLead) return;
    setSavingLead(true);
    try {
      await apiFetch(`/crm/leads/${selectedLead.id}`, { method: 'PATCH', body: JSON.stringify(editForm) });
      await loadCrmLeads(activeConv?.customer_id);
      setShowLeadModal(false);
    } catch (err: any) { alert('Error: ' + err.message); }
    setSavingLead(false);
  }

  async function moveLead(lead: any, stageId: number) {
    setMovingStage(true);
    try {
      await apiFetch(`/crm/leads/${lead.id}/stage`, { method: 'PATCH', body: JSON.stringify({ pipeline_stage_id: stageId }) });
      const stage = crmStages.find(s => s.id === stageId);
      setCrmLeads(prev => prev.map(l => l.id === lead.id
        ? { ...l, pipeline_stage_id: stageId, stage_name: stage?.name, stage, status: stage?.maps_to_status || l.status }
        : l));
    } catch (err: any) { alert('Error: ' + err.message); }
    setMovingStage(false);
  }

  async function leadAction(lead: any, action: string) {
    try {
      const r = await apiFetch(`/crm/leads/${lead.id}/${action}`, { method: 'POST' });
      alert(r?.message || 'Accion completada');
      await loadCrmLeads(activeConv?.customer_id);
      setShowLeadModal(false);
    } catch (err: any) { alert('Error: ' + err.message); }
  }

  async function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    setIsCalculating(true); setQuoteResult(null);
    try {
      const r = await calculateQuotation(
        parseFloat(quoteForm.costUsd), parseFloat(quoteForm.discount),
        parseFloat(quoteForm.weightLb), parseFloat(quoteForm.trm));
      setQuoteResult(r);
    } catch { alert('Error calculando'); }
    finally { setIsCalculating(false); }
  }

  function startDrag(setter: (v: number) => void, axis: 'x'|'xr'|'y', min: number, max: number) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      const start  = axis === 'y' ? e.pageY : e.pageX;
      const startV = axis === 'y' ? crmHeight : axis === 'x' ? inboxWidth : col4Width;
      const move = (ev: MouseEvent) => {
        const delta = (axis === 'y' ? ev.pageY : ev.pageX) - start;
        setter(Math.max(min, Math.min(max, startV + (axis === 'xr' ? -delta : delta))));
      };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    };
  }

  const activeConvData = conversations.find(c => c.id === activeConvId) || activeConv;
  const chanCfg = activeConvData ? (CHANNEL_CONFIG[activeConvData.channel] || CHANNEL_CONFIG.web) : CHANNEL_CONFIG.web;
  const ChIcon  = chanCfg.Icon;
  const iFS     = FS[inboxFontSize];
  const cFS     = FS[crmFontSize];
  const inboxFiltered = conversations.filter(c =>
    !searchInbox ||
    c.customer_name?.toLowerCase().includes(searchInbox.toLowerCase()) ||
    c.last_message?.toLowerCase().includes(searchInbox.toLowerCase()));

  return (
    <div className="h-full w-full bg-white flex overflow-hidden">

      {/* COL 1: CHANNELS */}
      <div className="w-[70px] bg-slate-50 border-r border-slate-200 flex flex-col items-center py-5 gap-3 flex-shrink-0">
        {Object.entries(CHANNEL_CONFIG).map(([id, cfg]) => {
          const unread = id === 'all'
            ? conversations.reduce((s, c) => s + (c.unread_count || 0), 0)
            : conversations.filter(c => c.channel === id).reduce((s, c) => s + (c.unread_count || 0), 0);
          const active = activeChannel === id;
          return (
            <button key={id} onClick={() => setActiveChannel(id)} title={cfg.label}
              className="relative flex flex-col items-center gap-1 outline-none">
              <div className="p-2.5 rounded-2xl transition-all"
                style={active ? { backgroundColor: cfg.bg, color: cfg.color, boxShadow: `0 2px 8px ${cfg.color}30` } : { color: '#94a3b8' }}>
                <cfg.Icon size={20} />
              </div>
              {unread > 0 && (
                <span className="absolute -top-1 right-0 bg-red-500 text-white font-black min-w-[15px] px-1 py-0.5 rounded-full border border-slate-50 text-center leading-none"
                  style={{ fontSize: 8 }}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
              <span className="font-bold" style={{ fontSize: 8, color: active ? cfg.color : '#94a3b8' }}>
                {cfg.label.split(' ')[0]}
              </span>
            </button>
          );
        })}
        <div className="flex-1" />
        <a href="/chat" target="_blank" title="Widget web"
          className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-colors">
          <ExternalLink size={14} />
        </a>
      </div>

      {/* COL 2: INBOX */}
      <div className="bg-white border-r border-slate-200 flex flex-col flex-shrink-0 relative" style={{ width: inboxWidth }}>
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-extrabold text-slate-800">Bandeja</h2>
            <div className="flex items-center gap-1.5">
              <FontSizePicker value={inboxFontSize} onChange={changeInboxFont} />
              <button onClick={loadConversations}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                <RefreshCw size={12} className={loadingConvs ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
            <input value={searchInbox} onChange={e => setSearchInbox(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none"
              style={{ fontSize: iFS.preview }} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvs && conversations.length === 0 ? (
            <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse" />)}</div>
          ) : inboxFiltered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-slate-400">
              <MessageCircle size={26} className="mb-2 opacity-30" />
              <p className="text-xs">Sin conversaciones</p>
            </div>
          ) : inboxFiltered.map(conv => {
            const cfg = CHANNEL_CONFIG[conv.channel] || CHANNEL_CONFIG.web;
            const isActive = conv.id === activeConvId;
            return (
              <button key={conv.id} onClick={() => setActiveConvId(conv.id)}
                className={`w-full text-left p-3 border-b border-slate-50 transition-all relative ${isActive ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
                {isActive && <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-indigo-600 rounded-r-full" />}
                <div className="flex items-start gap-2 pl-0.5">
                  <div className="relative flex-shrink-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black"
                      style={{ backgroundColor: cfg.color, fontSize: 10 }}>
                      {initials(conv.customer_name)}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white"
                      style={{ backgroundColor: cfg.color }}>
                      <cfg.Icon size={7} className="text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-bold text-slate-800 truncate pr-1" style={{ fontSize: iFS.name }}>
                        {conv.customer_name}
                      </span>
                      <span className="text-slate-400 flex-shrink-0" style={{ fontSize: iFS.sub }}>
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>
                    <p className="text-slate-500 truncate" style={{ fontSize: iFS.preview }}>
                      {conv.last_message || '...'}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{ fontSize: iFS.badge, backgroundColor: cfg.bg, color: cfg.color }}>
                        {cfg.label}
                      </span>
                      {conv.unread_count > 0 && (
                        <span className="bg-indigo-600 text-white font-black px-1.5 py-0.5 rounded-full"
                          style={{ fontSize: 8 }}>
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div onMouseDown={startDrag(setInboxWidth, 'x', 220, 500)}
          className="absolute right-0 top-0 bottom-0 w-1.5 hover:bg-indigo-400/40 cursor-col-resize z-20" />
      </div>

      {/* COL 3: CHAT */}
      <div className="flex-1 flex flex-col min-w-[260px] bg-slate-50/30">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 flex items-center justify-between px-4 py-2.5 flex-shrink-0">
          {activeConvData ? (
            <>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black"
                  style={{ backgroundColor: chanCfg.color, fontSize: 10 }}>
                  {initials(activeConvData.customer_name)}
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm leading-tight">{activeConvData.customer_name}</p>
                  <div className="flex items-center gap-1">
                    <ChIcon size={9} style={{ color: chanCfg.color }} />
                    <span className="text-slate-400" style={{ fontSize: 10 }}>{chanCfg.label}</span>
                    {activeConvData.channel === 'web' && (
                      <>
                        <Circle size={5} className="fill-emerald-400 text-emerald-400 ml-1" />
                        <span className="font-bold text-emerald-600" style={{ fontSize: 10 }}>en linea</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setShowQuoteModal(true)} title="Cotizador"
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                  <Calculator size={16} />
                </button>
                <button className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors">
                  <MoreVertical size={16} />
                </button>
              </div>
            </>
          ) : <p className="text-slate-400 text-sm">Selecciona una conversacion</p>}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingMsgs ? (
            <div className="flex justify-center pt-10"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>
          ) : messages.length === 0 && activeConvId ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <MessageCircle size={32} className="mb-2 opacity-20" />
              <p className="text-xs">Sin mensajes</p>
            </div>
          ) : messages.map((msg, idx) => (
            <div key={`m-${msg.id}-${idx}`} className={`flex ${msg.direction === 'in' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[74%] rounded-2xl px-4 py-2.5 shadow-sm ${
                msg.direction === 'in'
                  ? 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'
                  : 'bg-indigo-600 text-white rounded-tr-none'
              }`}>
                {msg.is_ai_generated && (
                  <div className="flex items-center gap-1 mb-1">
                    <Bot size={9} className="text-indigo-200" />
                    <span style={{ fontSize: 8 }} className="text-indigo-200 font-bold">IA</span>
                  </div>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                <div className={`mt-1 flex items-center justify-end gap-1 ${msg.direction === 'in' ? 'text-slate-400' : 'text-indigo-200'}`}
                  style={{ fontSize: 9 }}>
                  {formatTime(msg.created_at)}
                  {msg.direction === 'out' && <CheckCheck size={10} />}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* AI suggestion */}
        {aiSuggestion && aiMode === 'suggestion' && activeConvId && (
          <div className="px-3 pb-1.5">
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <Bot size={12} className="text-indigo-500 flex-shrink-0" />
              <p className="text-indigo-800 flex-1 truncate" style={{ fontSize: 11 }}>{aiSuggestion}</p>
              <button onClick={() => { setInputText(aiSuggestion); textareaRef.current?.focus(); }}
                className="font-black bg-indigo-600 text-white px-2.5 py-1 rounded-lg hover:bg-indigo-700 flex-shrink-0"
                style={{ fontSize: 9 }}>
                Insertar
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        {activeConvId && (
          <div className="p-3 bg-white border-t border-slate-200 flex-shrink-0">
            <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 p-2 rounded-2xl focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
              <button className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-xl transition-colors">
                <Paperclip size={16} />
              </button>
              <textarea ref={textareaRef} rows={1} value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-1.5 text-sm text-slate-700 outline-none max-h-28"
                placeholder="Escribe un mensaje... (Enter para enviar)" />
              <button onClick={sendMessage} disabled={!inputText.trim() || sending}
                className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors">
                {sending ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* COL 4: CRM + Historias */}
      <div className="bg-slate-50 border-l border-slate-200 flex flex-col flex-shrink-0 relative" style={{ width: col4Width }}>
        <div onMouseDown={startDrag(setCol4Width, 'xr', 300, 620)}
          className="absolute left-0 top-0 bottom-0 w-1.5 hover:bg-indigo-400/40 cursor-col-resize z-20" />

        {/* Col4 Tab Switcher */}
        <div className="flex items-center gap-0.5 px-3 pt-2 pb-1 bg-white border-b border-slate-200 shrink-0">
          {([['crm','CRM'],['historias','📸 Historias']] as [string,string][]).map(([v,l])=>(
            <button key={v} onClick={()=>setStoryTab(v as any)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${storyTab===v?'bg-indigo-600 text-white':'text-slate-500 hover:bg-slate-100'}`}>{l}</button>
          ))}
        </div>

        {/* HISTORIAS PANEL */}
        {storyTab === 'historias' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <span className="font-black text-slate-700 text-[10px] uppercase">Catálogo de Historias Activas</span>
              <button onClick={loadStoryCatalog} className="p-1 hover:bg-slate-100 rounded-lg"><RefreshCw size={11} className={storyCatalogLoading?'animate-spin text-purple-600':'text-slate-400'}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {storyCatalogLoading && <div className="text-center py-8 text-slate-400"><RefreshCw size={18} className="animate-spin mx-auto mb-2"/><p style={{fontSize:10}}>Cargando historias...</p></div>}
              {!storyCatalogLoading && storyCatalog.length===0 && (
                <div className="text-center py-8 text-slate-400">
                  <Camera size={24} className="mx-auto mb-2 opacity-25"/>
                  <p style={{fontSize:10}} className="font-bold">Sin historias publicadas</p>
                  <a href="/dashboard/marketing/historias" target="_blank" className="text-purple-600 font-bold text-[9px] hover:underline mt-1 block">Crear historia →</a>
                </div>
              )}
              {storyCatalog.map((s:any)=>(
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-purple-300 hover:shadow-sm transition-all">
                  {/* Product image */}
                  <div className="w-full h-24 bg-gradient-to-br from-purple-50 to-pink-50 relative overflow-hidden">
                    {s.imagen_url ? (
                      <img src={s.imagen_url} alt={s.producto_nombre} className="w-full h-full object-cover"/>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera size={20} className="text-slate-300"/>
                      </div>
                    )}
                    <span className="absolute top-1 right-1 text-[9px] bg-purple-600 text-white px-1.5 py-0.5 rounded font-bold">{s.canal||'IG'}</span>
                  </div>
                  <div className="p-2">
                    <p className="font-black text-slate-800 leading-tight truncate" style={{fontSize:11}}>{s.producto_nombre||'Producto'}</p>
                    <p className="font-black text-purple-700 mt-0.5" style={{fontSize:12}}>{s.precio_cop ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(s.precio_cop) : '-'}</p>
                    {/* Action buttons */}
                    <div className="flex gap-1 mt-2">
                      <button
                        onClick={()=>{
                          setShowNewLead(true);
                          setNewLeadForm((f:any)=>({...f, lead_product_name: s.producto_nombre, lead_description: `Interés por historia: ${s.producto_nombre} - ${s.canal}`, solicitud_tipo:'Lead Historia'}));
                        }}
                        className="flex-1 text-[9px] py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-black transition-colors"
                      >
                        + Lead
                      </button>
                      <button
                        onClick={()=>{
                          if (activeConv) {
                            const precio = s.precio_cop ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(s.precio_cop) : 'consultar precio';
                            setInputText(`¡Hola! 👋 El producto **${s.producto_nombre}** tiene un precio de **${precio}**. ¿Te gustaría cotizarlo o tienes alguna pregunta?`);
                          }
                        }}
                        className="flex-1 text-[9px] py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg font-black transition-colors"
                      >
                        Responder
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CRM Panel (existing) — only show when storyTab=crm */}
        {storyTab === 'crm' && (<>
        <div className="flex flex-col bg-white border-b border-slate-200 relative overflow-hidden" style={{ height: crmHeight }}>

          {/* Customer header */}
          <div className="px-4 py-2.5 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-extrabold text-slate-800 text-sm truncate">
                  {activeConvData?.customer_name || 'Sin cliente'}
                </p>
                <p className="text-slate-400 truncate" style={{ fontSize: 10 }}>
                  {activeConvData?.customer_email || activeConvData?.customer_phone || 'Sin contacto'}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                {activeConvData?.customer_phone && (
                  <a href={`tel:${activeConvData.customer_phone}`}
                    className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg">
                    <Phone size={12} />
                  </a>
                )}
                {activeConvData?.customer_id && (
                  <a href={`/dashboard/agenda_clientes/${activeConvData.customer_id}`} target="_blank"
                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Historial header */}
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-600 uppercase tracking-wide" style={{ fontSize: 10 }}>Historial CRM</span>
              <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold" style={{ fontSize: 9 }}>
                {crmLeads.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <FontSizePicker value={crmFontSize} onChange={changeCrmFont} />
              <button onClick={() => setShowMyLeads(v => !v)}
                className={`font-black uppercase px-2 py-1 rounded-lg flex items-center gap-1 transition-all ${showMyLeads ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                style={{ fontSize: 8 }}>
                <User size={8} />{showMyLeads ? 'Mios' : 'Todos'}
              </button>
              <button onClick={() => { setShowNewLead(true); setNewLeadError(''); }}
                className="flex items-center gap-1 font-black bg-indigo-600 text-white px-2 py-1 rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
                style={{ fontSize: 9 }}>
                <Plus size={10} /> Nueva
              </button>
            </div>
          </div>

          {/* Leads */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {loadingLeads ? (
              <div className="flex justify-center py-4"><RefreshCw size={15} className="animate-spin text-slate-400" /></div>
            ) : crmLeads.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <FileText size={22} className="mx-auto mb-2 opacity-25" />
                <p style={{ fontSize: cFS.name }}>
                  {activeConv?.customer_id ? 'Sin registros CRM' : 'Crea una nueva solicitud'}
                </p>
                <button onClick={() => setShowNewLead(true)}
                  className="mt-2 font-bold text-indigo-600 hover:underline flex items-center gap-1 mx-auto"
                  style={{ fontSize: 10 }}>
                  <Plus size={9} /> Primera solicitud
                </button>
              </div>
            ) : crmLeads.map((lead, idx) => {
              const stage = crmStages.find(s => s.id === lead.pipeline_stage_id)
                || { name: lead.stage_name || 'Sin etapa', color: 'bg-slate-500' };
              const sc = stageColor(stage);
              return (
                <div key={`lead-${lead.id ?? idx}-${idx}`}
                  className="border border-slate-200 rounded-xl overflow-hidden bg-white hover:border-indigo-300 hover:shadow-sm transition-all group">
                  <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between group-hover:bg-indigo-50/20">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-black text-slate-400" style={{ fontSize: cFS.sub }}>#{lead.id}</span>
                      <span className="font-bold text-slate-800 truncate" style={{ fontSize: cFS.name }}>
                        {lead.solicitud_tipo || 'Lead'}
                      </span>
                    </div>
                    <span className="font-black uppercase px-1.5 py-0.5 rounded-md"
                      style={{ fontSize: cFS.badge, backgroundColor: `${sc}18`, color: sc, border: `1px solid ${sc}40` }}>
                      {(stage.name || '').length > 12 ? (stage.name || '').slice(0, 12) + '..' : (stage.name || '')}
                    </span>
                  </div>

                  <div className="px-3 py-2">
                    {lead.lead_product_name && (
                      <p className="text-slate-500 flex items-center gap-1 mb-1 truncate" style={{ fontSize: cFS.sub }}>
                        <FileText size={8} />{lead.lead_product_name}
                      </p>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-black text-slate-800" style={{ fontSize: cFS.name }}>
                        {(lead.value || lead.lead_value) > 0
                          ? `$${Number(lead.value ?? lead.lead_value).toLocaleString('es-CO')}`
                          : '-'}
                      </span>
                      {lead.advisor_name && (
                        <span className="text-slate-400 flex items-center gap-0.5 truncate" style={{ fontSize: cFS.badge }}>
                          <User size={7} />{lead.advisor_name}
                        </span>
                      )}
                    </div>

                    {/* Inline pipeline mover */}
                    <div className="flex flex-wrap gap-1">
                      {crmStages.map(s => {
                        const isActive = s.id === lead.pipeline_stage_id;
                        const c = stageColor(s);
                        return (
                          <button key={s.id} onClick={() => !isActive && moveLead(lead, s.id)}
                            disabled={movingStage || isActive}
                            title={s.name}
                            className={`font-black uppercase px-1.5 py-0.5 rounded transition-all leading-tight ${
                              isActive ? 'text-white' : 'text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200'
                            }`}
                            style={{ fontSize: 7, ...(isActive ? { backgroundColor: c } : {}) }}>
                            {s.name.length > 9 ? s.name.slice(0, 9) + '..' : s.name}
                          </button>
                        );
                      })}
                    </div>

                    <button onClick={() => openLead(lead)}
                      className="mt-1.5 w-full text-right font-bold text-indigo-600 hover:text-indigo-800 flex items-center justify-end gap-0.5"
                      style={{ fontSize: cFS.badge }}>
                      Gestionar <ChevronRight size={9} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div onMouseDown={startDrag(setCrmHeight, 'y', 180, 720)}
            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-indigo-400/40 z-20" />
        </div>

        {/* AI Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 bg-white border-b border-indigo-100 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-1 rounded-lg"><Sparkles size={11} className="text-white" /></div>
              <span className="font-extrabold text-indigo-900 text-sm">Agente IA</span>
              <div className={`w-1.5 h-1.5 rounded-full ${aiMode === 'off' ? 'bg-slate-400' : aiMode === 'auto' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
            </div>
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              {(['off','suggestion','auto'] as const).map(m => (
                <button key={m} onClick={() => toggleAiMode(m)}
                  className={`px-2 py-1 rounded-md font-black uppercase transition-all ${aiMode === m ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                  style={{ fontSize: 8 }}>
                  {m === 'off' ? 'Off' : m === 'suggestion' ? 'Suger.' : 'Auto'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gradient-to-b from-white to-indigo-50/20">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex gap-2">
              <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${aiMode === 'off' ? 'bg-slate-400' : aiMode === 'auto' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
              <div>
                <p className="font-black text-slate-400 uppercase mb-0.5" style={{ fontSize: 9 }}>Estado IA</p>
                <p className="font-bold text-slate-700 leading-snug" style={{ fontSize: 11 }}>
                  {aiMode === 'off' ? 'Desactivada.' : aiMode === 'auto' ? 'AUTO: responde automaticamente.' : 'SUGERENCIA: propone al asesor.'}
                </p>
              </div>
            </div>

            {activeConvData && (
              <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-3">
                <p className="font-black text-indigo-700 uppercase mb-1.5" style={{ fontSize: 9 }}>Contexto</p>
                <div className="space-y-0.5" style={{ fontSize: 10 }}>
                  <p className="text-indigo-800"><span className="font-bold">Canal:</span> {CHANNEL_CONFIG[activeConvData.channel]?.label || activeConvData.channel}</p>
                  <p className="text-indigo-800"><span className="font-bold">Leads:</span> {crmLeads.length}</p>
                  <p className="text-indigo-800"><span className="font-bold">Mensajes:</span> {messages.length}</p>
                  {crmLeads.length > 0 && <p className="text-indigo-800"><span className="font-bold">Ultimo estado:</span> {crmLeads[0].stage_name || crmLeads[0].status}</p>}
                  {currentUser && <p className="text-indigo-800"><span className="font-bold">Asesor:</span> {currentUser}</p>}
                </div>
              </div>
            )}

            {aiSuggestion && aiMode !== 'off' && (
              <div className="bg-indigo-600 rounded-2xl p-4 text-white shadow-md">
                <div className="flex items-center gap-1 mb-2">
                  <Bot size={10} className="text-indigo-200" />
                  <span className="font-black text-indigo-200 uppercase" style={{ fontSize: 9 }}>Sugerencia IA</span>
                  {loadingAI && <RefreshCw size={9} className="animate-spin text-indigo-300 ml-auto" />}
                </div>
                <p className="font-medium leading-relaxed mb-3" style={{ fontSize: 12 }}>"{aiSuggestion}"</p>
                {aiMode === 'suggestion' && (
                  <div className="flex gap-2">
                    <button onClick={() => { setInputText(aiSuggestion); textareaRef.current?.focus(); }}
                      className="flex-1 bg-white text-indigo-700 font-black py-1.5 rounded-lg hover:bg-indigo-50"
                      style={{ fontSize: 9 }}>
                      Insertar
                    </button>
                    <button onClick={async () => {
                      if (!activeConvId) return;
                      const d = await apiFetch(`/chat/conversations/${activeConvId}/reply`, {
                        method: 'POST', body: JSON.stringify({ content: aiSuggestion, is_ai_generated: true }),
                      }).catch(() => null);
                      if (d) setMessages(prev => [...prev, { id: d.id || Date.now(), direction: 'out', content: aiSuggestion, is_ai_generated: true, created_at: new Date().toISOString() }]);
                    }} className="flex-1 bg-indigo-500 text-white font-black py-1.5 rounded-lg hover:bg-indigo-400 border border-indigo-400"
                      style={{ fontSize: 9 }}>
                      Enviar directo
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </>)}
      </div>

      {/* MODAL: NUEVA SOLICITUD */}
      {showNewLead && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">
            <div className="px-5 py-4 bg-gradient-to-r from-indigo-50 to-white border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">Nueva Solicitud CRM</h3>
                <p className="text-slate-400 mt-0.5" style={{ fontSize: 11 }}>Se registrara en el CRM e historial del cliente</p>
              </div>
              <button onClick={() => setShowNewLead(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={17} /></button>
            </div>

            <form onSubmit={createNewLead} className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
              {newLeadError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 flex items-start gap-2 text-red-700" style={{ fontSize: 12 }}>
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />{newLeadError}
                </div>
              )}

              {/* Customer field */}
              {!activeConv?.customer_id ? (
                <div>
                  <label className="block font-black text-slate-500 uppercase mb-1.5 flex items-center gap-1" style={{ fontSize: 10 }}>
                    <User size={10} /> Cliente *
                  </label>
                  <div className="relative">
                    <input
                      value={newLeadForm.customer_search}
                      onChange={e => onCustomerSearch(e.target.value)}
                      onFocus={() => { setShowCustomerList(true); if (!newLeadForm.customer_search) onCustomerSearch(''); }}
                      placeholder="Buscar por nombre, email o telefono..."
                      autoComplete="off"
                      className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 pr-8 ${
                        newLeadForm.customer_id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                      }`}
                    />
                    {newLeadForm.customer_id ? (
                      <Check size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                    ) : searchingCustomer ? (
                      <RefreshCw size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                    ) : (
                      <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    )}
                    {showCustomerList && (customerResults.length > 0 || newLeadForm.customer_search.length > 0) && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                        {customerResults.length === 0 && !searchingCustomer ? (
                          <div className="p-3 text-center text-slate-500" style={{ fontSize: 11 }}>
                            <p>No encontrado en la base de datos</p>
                            <a href="/dashboard/agenda_clientes" target="_blank"
                              className="text-indigo-600 font-bold hover:underline flex items-center gap-1 justify-center mt-1">
                              <UserPlus size={11} /> Crear nuevo cliente
                            </a>
                          </div>
                        ) : customerResults.map(c => (
                          <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                            className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
                            <p className="font-bold text-slate-800" style={{ fontSize: 12 }}>
                              {c.full_name || `${c.first_name} ${c.last_name}`}
                            </p>
                            <p className="text-slate-400" style={{ fontSize: 10 }}>
                              {c.email || c.phone || c.city || '-'}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {newLeadForm.customer_id && (
                    <p className="font-bold text-emerald-600 mt-1 flex items-center gap-1" style={{ fontSize: 10 }}>
                      <Check size={9} /> Cliente seleccionado
                    </p>
                  )}
                  {!newLeadForm.customer_id && (
                    <p className="text-amber-600 mt-1 flex items-center gap-1" style={{ fontSize: 10 }}>
                      <AlertCircle size={9} /> Selecciona un cliente para continuar
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" />
                  <div>
                    <p className="font-bold text-emerald-800" style={{ fontSize: 12 }}>{activeConvData?.customer_name}</p>
                    <p className="text-emerald-600" style={{ fontSize: 10 }}>Cliente vinculado a esta conversacion</p>
                  </div>
                </div>
              )}

              {[
                ['Tipo de Solicitud', 'select', 'solicitud_tipo', SOLICITUD_TIPOS],
                ['Etapa Inicial', 'select-stages', 'pipeline_stage_id', []],
                ['Producto / Interes', 'text', 'lead_product_name', 'Ej. Extractor electrico doble'],
                ['Valor estimado (COP)', 'number', 'lead_value', '0'],
                ['Descripcion / Notas', 'textarea', 'lead_description', 'Contexto del chat, interes, requerimientos...'],
                ['Asesor responsable', 'text', 'advisor_name', currentUser || 'Nombre del asesor'],
              ].map(([label, type, key, options]: any) => (
                <div key={key as string}>
                  <label className="block font-black text-slate-500 uppercase mb-1" style={{ fontSize: 10 }}>{label}</label>
                  {type === 'select' ? (
                    <select value={newLeadForm[key as string]}
                      onChange={e => setNewLeadForm((f: any) => ({ ...f, [key as string]: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400">
                      {(options as string[]).map((t: string) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ) : type === 'select-stages' ? (
                    <select value={newLeadForm.pipeline_stage_id}
                      onChange={e => setNewLeadForm((f: any) => ({ ...f, pipeline_stage_id: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400">
                      {crmStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  ) : type === 'textarea' ? (
                    <textarea rows={2} value={newLeadForm[key as string]}
                      onChange={e => setNewLeadForm((f: any) => ({ ...f, [key as string]: e.target.value }))}
                      placeholder={options as string}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none" />
                  ) : (
                    <input type={type as string} value={newLeadForm[key as string]}
                      onChange={e => setNewLeadForm((f: any) => ({ ...f, [key as string]: e.target.value }))}
                      placeholder={options as string}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
                  )}
                </div>
              ))}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowNewLead(false)}
                  className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                <button type="submit"
                  disabled={savingNew || (!activeConv?.customer_id && !newLeadForm.customer_id)}
                  className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {savingNew ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  {savingNew ? 'Creando...' : 'Crear en CRM'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LEAD GESTION */}
      {showLeadModal && selectedLead && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100">
            <div className="px-5 py-4 bg-gradient-to-r from-indigo-50 to-white border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-slate-800">Lead #{selectedLead.id}</h3>
                <p className="text-slate-400" style={{ fontSize: 11 }}>{activeConvData?.customer_name}</p>
              </div>
              <button onClick={() => setShowLeadModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={17} /></button>
            </div>

            <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
              <div>
                <label className="block font-black text-slate-500 uppercase mb-1" style={{ fontSize: 10 }}>Tipo</label>
                <select value={editForm.solicitud_tipo}
                  onChange={e => setEditForm((f: any) => ({ ...f, solicitud_tipo: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400">
                  {SOLICITUD_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block font-black text-slate-500 uppercase mb-1.5" style={{ fontSize: 10 }}>
                  Pipeline - haz click para mover
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {crmStages.map(s => {
                    const isActive = editForm.pipeline_stage_id === s.id;
                    const c = stageColor(s);
                    return (
                      <button key={s.id}
                        onClick={() => setEditForm((f: any) => ({ ...f, pipeline_stage_id: s.id }))}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          isActive ? 'text-white shadow-sm' : 'border border-slate-200 text-slate-600 hover:border-indigo-300'
                        }`}
                        style={isActive ? { backgroundColor: c, borderColor: c } : {}}>
                        {isActive && <Check size={10} />}{s.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {[
                ['Producto', 'lead_product_name', 'text', 'Producto o interes'],
                ['Valor (COP)', 'lead_value', 'number', '0'],
                ['Asesor', 'advisor_name', 'text', 'Nombre del asesor'],
              ].map(([label, key, type, ph]) => (
                <div key={key as string}>
                  <label className="block font-black text-slate-500 uppercase mb-1" style={{ fontSize: 10 }}>{label}</label>
                  <input type={type as string} value={editForm[key as string]} placeholder={ph as string}
                    onChange={e => setEditForm((f: any) => ({
                      ...f, [key as string]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                    }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
                </div>
              ))}

              <div>
                <label className="block font-black text-slate-500 uppercase mb-1" style={{ fontSize: 10 }}>Descripcion</label>
                <textarea rows={2} value={editForm.lead_description}
                  onChange={e => setEditForm((f: any) => ({ ...f, lead_description: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none" />
              </div>

              <div className="pt-1 border-t border-slate-100">
                <p className="font-black text-slate-500 uppercase mb-2" style={{ fontSize: 10 }}>Acciones</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Crear Solicitud',  MoveRight,    'to-solicitud',  'bg-purple-50 border-purple-200 text-purple-700'],
                    ['Crear Cotizacion', Calculator,   'to-cotizacion', 'bg-amber-50 border-amber-200 text-amber-700'],
                    ['Crear Pedido',     ShoppingCart,  'to-pedido',    'bg-emerald-50 border-emerald-200 text-emerald-700'],
                  ].map(([label, Icon, action, bg]: any) => (
                    <button key={label} onClick={() => leadAction(selectedLead, action)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2 border rounded-xl text-xs font-bold transition-colors hover:opacity-80 ${bg}`}>
                      <Icon size={12} />{label}
                    </button>
                  ))}
                  <a href="/dashboard/crm" target="_blank"
                    className="flex items-center justify-center gap-1.5 py-2 px-2 border border-slate-200 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold hover:opacity-80">
                    <ExternalLink size={12} /> Ver en CRM
                  </a>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowLeadModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-xl">Cancelar</button>
              <button onClick={saveLead} disabled={savingLead}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2">
                {savingLead ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COTIZADOR */}
      {showQuoteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 text-white rounded-xl"><Calculator size={18} /></div>
                <div>
                  <h3 className="font-extrabold text-slate-800">Cotizador Rapido</h3>
                  <p className="text-slate-400" style={{ fontSize: 10 }}>Motor TRM</p>
                </div>
              </div>
              <button onClick={() => setShowQuoteModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={18} /></button>
            </div>
            <div className="p-5">
              <form onSubmit={handleCalculate} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[['Costo (USD)','costUsd','120.00'],['Descuento (%)','discount','0'],['Peso (lb)','weightLb','1'],['TRM','trm','4200']].map(([label,key,ph]) => (
                    <div key={key}>
                      <label className="block font-bold text-slate-500 mb-1" style={{ fontSize: 10 }}>{label}</label>
                      <input type="number" step="any" value={(quoteForm as any)[key]}
                        onChange={e => setQuoteForm(f => ({ ...f, [key]: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder={ph} />
                    </div>
                  ))}
                </div>
                <button type="submit" disabled={isCalculating}
                  className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-60 flex justify-center items-center gap-2">
                  {isCalculating ? 'Calculando...' : <><ArrowRight size={15} /> Calcular precio sugerido</>}
                </button>
              </form>
              {quoteResult && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ['Costo total',     quoteResult.total_cost_cop,       'bg-slate-50 border-slate-200 text-slate-700'],
                      ['Precio sugerido', quoteResult.suggested_price_cop,  'bg-indigo-50 border-indigo-200 text-indigo-700'],
                      ['Anticipo 50%',    quoteResult.advance_payment_cop,  'bg-emerald-50 border-emerald-200 text-emerald-700'],
                    ].map(([l, v, cls]) => (
                      <div key={l as string} className={`p-3 rounded-2xl border text-center ${cls}`}>
                        <p className="font-bold uppercase mb-1" style={{ fontSize: 9 }}>{l as string}</p>
                        <p className="font-extrabold" style={{ fontSize: 15 }}>${Number(v).toLocaleString('es-CO')}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => {
                    setInputText(
                      `Cotizacion:\n` +
                      `- Costo: $${Number(quoteResult.total_cost_cop).toLocaleString('es-CO')} COP\n` +
                      `- Precio sugerido: $${Number(quoteResult.suggested_price_cop).toLocaleString('es-CO')} COP\n` +
                      `- Anticipo (50%): $${Number(quoteResult.advance_payment_cop).toLocaleString('es-CO')} COP`
                    );
                    setShowQuoteModal(false);
                  }} className="w-full mt-3 bg-slate-800 text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
                    <Send size={13} /> Enviar al chat
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

