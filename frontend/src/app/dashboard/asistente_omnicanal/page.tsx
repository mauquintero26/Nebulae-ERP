'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageCircle, Globe, LayoutGrid, Search, MoreVertical, Send,
  Paperclip, CheckCheck, Bot, Sparkles, FileText, ChevronRight,
  X, Calculator, ArrowRight, Phone, Mail, RefreshCw, Plus,
  Edit3, Trash2, MoveRight, ShoppingCart, Package, User,
  Clock, AlertCircle, ChevronDown, ExternalLink, Zap,
  Circle, Check, Camera, Users
} from 'lucide-react';
import { calculateQuotation } from '@/lib/api';

// Inline SVG icons for social channels (lucide-react doesn't have brand icons)
const IGIcon = ({ size = 22, ...p }: { size?: number; [k: string]: any }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
  </svg>
);
const FBIcon = ({ size = 22, ...p }: { size?: number; [k: string]: any }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" {...p}>
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
  if (!res.ok) throw new Error(data.message || data.detail || 'Error');
  return data.data ?? data;
}

// â”€â”€ Channel config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CHANNEL_CONFIG = {
  all:       { label: 'Todos',     color: '#6366f1', bg: '#eef2ff', Icon: LayoutGrid },
  web:       { label: 'Web Chat',  color: '#0ea5e9', bg: '#f0f9ff', Icon: Globe },
  whatsapp:  { label: 'WhatsApp',  color: '#25d366', bg: '#f0fdf4', Icon: MessageCircle },
  instagram: { label: 'Instagram', color: '#e1306c', bg: '#fdf2f8', Icon: IGIcon },
  facebook:  { label: 'Facebook',  color: '#1877f2', bg: '#eff6ff', Icon: FBIcon },
};

// â”€â”€ Status badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STATUS_COLORS: Record<string, string> = {
  'Nuevo Lead':         'bg-blue-100 text-blue-700',
  'Solicitud':          'bg-purple-100 text-purple-700',
  'CotizaciÃ³n':         'bg-amber-100 text-amber-700',
  'Pendiente de Pago':  'bg-rose-100 text-rose-700',
  'Pedido de Venta':    'bg-emerald-100 text-emerald-700',
  'DRAFT':   'bg-blue-100 text-blue-700',
  'PENDING': 'bg-amber-100 text-amber-700',
  'QUOTATION':'bg-purple-100 text-purple-700',
  'TO_INVOICE':'bg-orange-100 text-orange-700',
  'INVOICED': 'bg-emerald-100 text-emerald-700',
  'CANCELLED':'bg-slate-100 text-slate-500',
};

function formatTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'ahora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// â•â• MAIN COMPONENT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function AsistenteOmnicanal() {
  // Layout
  const [inboxWidth, setInboxWidth]   = useState(300);
  const [col4Width, setCol4Width]     = useState(360);
  const [crmHeight, setCrmHeight]     = useState(380);

  // Channel & conversation state
  const [activeChannel, setActiveChannel] = useState('all');
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConvId, setActiveConvId]   = useState<number | null>(null);
  const [messages, setMessages]           = useState<any[]>([]);
  const [activeConv, setActiveConv]       = useState<any>(null);
  const [loadingConvs, setLoadingConvs]   = useState(true);
  const [loadingMsgs, setLoadingMsgs]     = useState(false);
  const [searchInbox, setSearchInbox]     = useState('');

  // Message compose
  const [inputText, setInputText]     = useState('');
  const [sending, setSending]         = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // AI
  const [aiMode, setAiMode]         = useState<'auto'|'suggestion'|'off'>('suggestion');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [loadingAI, setLoadingAI]   = useState(false);

  // CRM column 4
  const [crmLeads, setCrmLeads]         = useState<any[]>([]);
  const [crmStages, setCrmStages]       = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [editLeadForm, setEditLeadForm]   = useState<any>({});
  const [savingLead, setSavingLead]       = useState(false);

  // Modals
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ costUsd:'', discount:'0', weightLb:'1', trm:'4200' });
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Polling refs
  const pollInboxRef = useRef<NodeJS.Timeout | null>(null);
  const pollMsgsRef  = useRef<NodeJS.Timeout | null>(null);
  const lastMsgTimeRef = useRef<string | null>(null);

  // â”€â”€ Load pipeline stages (for CRM col 4) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    apiFetch('/crm/pipeline-stages/config')
      .then(d => setCrmStages(Array.isArray(d) ? d : (d?.data ?? [])))
      .catch(() => {});
  }, []);

  // â”€â”€ Load conversations (inbox) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadConversations = useCallback(async () => {
    try {
      const channel = activeChannel === 'all' ? '' : activeChannel;
      const q = channel ? `?channel=${channel}` : '';
      const d = await apiFetch(`/chat/conversations${q}`);
      const arr = Array.isArray(d) ? d : (d?.data ?? []);
      setConversations(arr);
      if (arr.length > 0 && !activeConvId) {
        setActiveConvId(arr[0].id);
      }
    } catch { }
    finally { setLoadingConvs(false); }
  }, [activeChannel, activeConvId]);

  useEffect(() => {
    setLoadingConvs(true);
    loadConversations();
    // Poll inbox every 5s
    pollInboxRef.current = setInterval(loadConversations, 5000);
    return () => { if (pollInboxRef.current) clearInterval(pollInboxRef.current); };
  }, [activeChannel]);

  // â”€â”€ Load messages for selected conversation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadMessages = useCallback(async (convId: number, since: string | null = null) => {
    try {
      const q = since ? `?since=${encodeURIComponent(since)}` : '';
      const d = await apiFetch(`/chat/conversations/${convId}/messages${q}`);
      const msgs = d?.messages ?? [];
      const conv = d?.conversation ?? null;
      if (since) {
        if (msgs.length > 0) {
          setMessages(prev => [...prev, ...msgs]);
          lastMsgTimeRef.current = msgs[msgs.length - 1].created_at;
        }
      } else {
        setMessages(msgs);
        if (msgs.length > 0) lastMsgTimeRef.current = msgs[msgs.length - 1].created_at;
        else lastMsgTimeRef.current = null;
      }
      if (conv) {
        setActiveConv(conv);
        setAiMode(conv.ai_mode || 'suggestion');
      }
    } catch { }
  }, []);

  useEffect(() => {
    if (!activeConvId) return;
    setLoadingMsgs(true);
    lastMsgTimeRef.current = null;
    loadMessages(activeConvId).finally(() => setLoadingMsgs(false));

    // Poll for new messages every 3s
    if (pollMsgsRef.current) clearInterval(pollMsgsRef.current);
    pollMsgsRef.current = setInterval(() => {
      loadMessages(activeConvId, lastMsgTimeRef.current);
    }, 3000);
    return () => { if (pollMsgsRef.current) clearInterval(pollMsgsRef.current); };
  }, [activeConvId]);

  // â”€â”€ Load CRM leads for customer in active conversation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!activeConv?.customer_id) { setCrmLeads([]); return; }
    apiFetch(`/crm/leads?search=`)
      .then(d => {
        const all = Array.isArray(d) ? d : (d?.data ?? []);
        const filtered = all.filter((l: any) => l.customer_id === activeConv.customer_id);
        setCrmLeads(filtered);
      })
      .catch(() => setCrmLeads([]));
  }, [activeConv?.customer_id]);

  // â”€â”€ Scroll to bottom on new messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // â”€â”€ AI suggestion on conversation change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!activeConvId || aiMode === 'off') { setAiSuggestion(''); return; }
    setLoadingAI(true);
    apiFetch(`/chat/conversations/${activeConvId}/ai-suggest`, { method: 'POST', body: JSON.stringify({}) })
      .then(d => setAiSuggestion(d?.suggestion || ''))
      .catch(() => setAiSuggestion(''))
      .finally(() => setLoadingAI(false));
  }, [activeConvId, messages.length]);

  // â”€â”€ Send message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function sendMessage() {
    if (!inputText.trim() || !activeConvId || sending) return;
    const content = inputText.trim();
    setInputText('');
    setSending(true);
    // Optimistic
    const optimistic = { id: Date.now(), direction: 'out', content, sender_name: 'Asesor', created_at: new Date().toISOString(), is_ai_generated: false };
    setMessages(prev => [...prev, optimistic]);
    try {
      const d = await apiFetch(`/chat/conversations/${activeConvId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ content, is_ai_generated: false }),
      });
      setMessages(prev => prev.map(m => m.id === optimistic.id ? d : m));
      setConversations(prev => prev.map(c =>
        c.id === activeConvId ? { ...c, last_message: content, last_message_at: new Date().toISOString() } : c
      ));
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    }
    setSending(false);
  }

  // â”€â”€ Insert AI suggestion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function insertSuggestion() {
    setInputText(aiSuggestion);
    textareaRef.current?.focus();
  }

  // â”€â”€ Toggle AI mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function toggleAiMode(mode: 'auto' | 'suggestion' | 'off') {
    if (!activeConvId) return;
    setAiMode(mode);
    await apiFetch(`/chat/conversations/${activeConvId}/ai-mode`, {
      method: 'PATCH',
      body: JSON.stringify({ mode }),
    }).catch(() => {});
  }

  // â”€â”€ Open lead detail modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function openLeadDetail(lead: any) {
    setSelectedLead(lead);
    setEditLeadForm({
      lead_description: lead.description || lead.lead_description || '',
      lead_value: lead.value || lead.lead_value || 0,
      lead_product_name: lead.lead_product_name || '',
      advisor_name: lead.advisor_name || '',
      solicitud_tipo: lead.solicitud_tipo || '',
      pipeline_stage_id: lead.pipeline_stage_id || '',
    });
    setShowLeadModal(true);
  }

  // â”€â”€ Save lead edits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function saveLead() {
    if (!selectedLead) return;
    setSavingLead(true);
    try {
      const updated = await apiFetch(`/crm/leads/${selectedLead.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editLeadForm),
      });
      setCrmLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, ...editLeadForm } : l));
      setShowLeadModal(false);
    } catch (e: any) {
      alert('Error guardando: ' + e.message);
    }
    setSavingLead(false);
  }

  // â”€â”€ Move lead to stage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function moveLeadToStage(lead: any, stageId: number) {
    const stage = crmStages.find(s => s.id === stageId);
    if (!stage) return;
    try {
      await apiFetch(`/crm/leads/${lead.id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ pipeline_stage_id: stageId }),
      });
      setCrmLeads(prev => prev.map(l =>
        l.id === lead.id ? { ...l, pipeline_stage_id: stageId, stage_name: stage.name, status: stage.maps_to_status } : l
      ));
      setShowLeadModal(false);
    } catch (e: any) {
      alert('Error moviendo: ' + e.message);
    }
  }

  // â”€â”€ Lead action (to-solicitud, to-cotizacion) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function leadAction(lead: any, action: string) {
    try {
      const r = await apiFetch(`/crm/leads/${lead.id}/${action}`, { method: 'POST' });
      alert(r.message || 'AcciÃ³n completada');
      // Refresh leads
      if (activeConv?.customer_id) {
        const all = await apiFetch(`/crm/leads`);
        const arr = Array.isArray(all) ? all : (all?.data ?? []);
        setCrmLeads(arr.filter((l: any) => l.customer_id === activeConv.customer_id));
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  }

  // â”€â”€ Quotation calculation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleCalculate(e: React.FormEvent) {
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
    } catch { alert('Error calculando cotizaciÃ³n'); }
    finally { setIsCalculating(false); }
  }

  // â”€â”€ Resize handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function startDragInbox(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.pageX, startW = inboxWidth;
    const move = (ev: MouseEvent) => setInboxWidth(Math.max(220, Math.min(480, startW + ev.pageX - startX)));
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }
  function startDragCol4(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.pageX, startW = col4Width;
    const move = (ev: MouseEvent) => setCol4Width(Math.max(300, Math.min(600, startW - (ev.pageX - startX))));
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }
  function startDragCrmH(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.pageY, startH = crmHeight;
    const move = (ev: MouseEvent) => setCrmHeight(Math.max(180, Math.min(700, startH + ev.pageY - startY)));
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }

  // â”€â”€ Active conversation for display â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const activeConvData = conversations.find(c => c.id === activeConvId) || activeConv;
  const ChannelIcon = activeConvData ? (CHANNEL_CONFIG[activeConvData.channel as keyof typeof CHANNEL_CONFIG]?.Icon || Globe) : Globe;
  const channelColor = activeConvData ? (CHANNEL_CONFIG[activeConvData.channel as keyof typeof CHANNEL_CONFIG]?.color || '#6366f1') : '#6366f1';

  // â•â• RENDER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  return (
    <div className="h-full w-full bg-white flex overflow-hidden">

      {/* â”€â”€ COL 1: CHANNEL SIDEBAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="w-20 bg-slate-50 border-r border-slate-200 flex flex-col items-center py-5 gap-3 flex-shrink-0 z-10">
        {Object.entries(CHANNEL_CONFIG).map(([id, cfg]) => {
          const unread = id === 'all'
            ? conversations.reduce((s, c) => s + (c.unread_count || 0), 0)
            : conversations.filter(c => c.channel === id).reduce((s, c) => s + (c.unread_count || 0), 0);
          return (
            <button
              key={id}
              onClick={() => setActiveChannel(id)}
              title={cfg.label}
              className="relative group outline-none flex flex-col items-center gap-1"
            >
              <div className={`p-3 rounded-2xl transition-all duration-200 ${
                activeChannel === id
                  ? 'shadow-md'
                  : 'text-slate-400 hover:bg-slate-200/60 hover:text-slate-700'
              }`} style={activeChannel === id ? { backgroundColor: cfg.bg, color: cfg.color } : {}}>
                <cfg.Icon strokeWidth={2.3} size={22}/>
              </div>
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full border-2 border-slate-50 min-w-[18px] text-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
              <span className="text-[8px] font-bold text-slate-400 group-hover:text-slate-600">{cfg.label}</span>
            </button>
          );
        })}
        <div className="flex-1"/>
        {/* Web chat link */}
        <a
          href="/chat"
          target="_blank"
          title="Widget de chat pÃºblico"
          className="p-2.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-colors"
        >
          <ExternalLink size={16}/>
        </a>
      </div>

      {/* â”€â”€ COL 2: INBOX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        className="bg-white border-r border-slate-200 flex flex-col flex-shrink-0 relative"
        style={{ width: inboxWidth }}
      >
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-extrabold text-slate-800">Bandeja</h2>
            <button onClick={loadConversations} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <RefreshCw size={14} className={loadingConvs ? 'animate-spin' : ''}/>
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
            <input
              value={searchInbox}
              onChange={e => setSearchInbox(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvs && conversations.length === 0 ? (
            <div className="flex flex-col gap-2 p-3">
              {[1,2,3].map(i => (
                <div key={i} className="p-3 rounded-xl bg-slate-50 animate-pulse">
                  <div className="h-3 w-28 bg-slate-200 rounded mb-2"/>
                  <div className="h-2.5 w-40 bg-slate-100 rounded"/>
                </div>
              ))}
            </div>
          ) : conversations
            .filter(c => !searchInbox || c.customer_name?.toLowerCase().includes(searchInbox.toLowerCase()) || c.last_message?.toLowerCase().includes(searchInbox.toLowerCase()))
            .map(conv => {
              const cfg = CHANNEL_CONFIG[conv.channel as keyof typeof CHANNEL_CONFIG] || CHANNEL_CONFIG.web;
              const isActive = conv.id === activeConvId;
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`w-full text-left p-3.5 border-b border-slate-50 transition-all relative ${
                    isActive ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
                  }`}
                >
                  {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-600 rounded-r-full"/>}
                  <div className="flex items-start gap-2.5">
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black"
                        style={{ backgroundColor: cfg.color }}
                      >
                        {initials(conv.customer_name || 'V')}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white" style={{ backgroundColor: cfg.color }}>
                        <cfg.Icon size={8} className="text-white"/>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <span className="font-bold text-slate-800 text-xs truncate pr-1">{conv.customer_name}</span>
                        <span className="text-[9px] text-slate-400 flex-shrink-0">{formatTime(conv.last_message_at)}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mb-1.5">{conv.last_message || '...'}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                        {conv.unread_count > 0 && (
                          <span className="bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          }
          {!loadingConvs && conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center p-8 text-slate-400">
              <MessageCircle size={32} className="mb-2 opacity-40"/>
              <p className="text-xs text-center">Sin conversaciones. El chat web ya estÃ¡ activo en <a href="/chat" target="_blank" className="text-indigo-500 underline">/chat</a></p>
            </div>
          )}
        </div>
        {/* Resize handle */}
        <div onMouseDown={startDragInbox} className="absolute right-0 top-0 bottom-0 w-1.5 hover:bg-indigo-400/40 cursor-col-resize bg-transparent z-20"/>
      </div>

      {/* â”€â”€ COL 3: CHAT THREAD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex-1 flex flex-col min-w-[280px] bg-slate-50/30">
        {/* Header */}
        <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-5 flex-shrink-0">
          {activeConvData ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm" style={{ backgroundColor: channelColor }}>
                  {initials(activeConvData.customer_name || 'V')}
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm leading-tight">{activeConvData.customer_name}</p>
                  <div className="flex items-center gap-1.5">
                    <ChannelIcon size={10} style={{ color: channelColor }}/>
                    <span className="text-[10px] text-slate-400">{CHANNEL_CONFIG[activeConvData.channel as keyof typeof CHANNEL_CONFIG]?.label}</span>
                    {activeConvData.channel === 'web' && (
                      <span className="flex items-center gap-0.5 text-[9px] text-emerald-500 font-bold">
                        <Circle size={6} className="fill-emerald-500"/> en lÃ­nea
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowQuoteModal(true)} title="Cotizador" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                  <Calculator size={17}/>
                </button>
                <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors">
                  <MoreVertical size={17}/>
                </button>
              </div>
            </>
          ) : (
            <p className="text-slate-400 text-sm">Selecciona una conversaciÃ³n</p>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingMsgs ? (
            <div className="flex justify-center pt-10 text-slate-400">
              <RefreshCw size={20} className="animate-spin"/>
            </div>
          ) : messages.length === 0 && activeConvId ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <MessageCircle size={40} className="mb-3 opacity-30"/>
              <p className="text-sm">AÃºn no hay mensajes</p>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.direction === 'in' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 shadow-sm ${
                  msg.direction === 'in'
                    ? 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'
                    : msg.is_ai_generated
                      ? 'bg-indigo-500 text-white rounded-tr-none'
                      : 'bg-indigo-600 text-white rounded-tr-none'
                }`}>
                  {msg.is_ai_generated && (
                    <div className="flex items-center gap-1 mb-1">
                      <Bot size={10} className="text-indigo-200"/>
                      <span className="text-[9px] text-indigo-200 font-bold">IA</span>
                    </div>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  <div className={`text-[9px] mt-1 flex items-center justify-end gap-1 ${msg.direction === 'in' ? 'text-slate-400' : 'text-indigo-200'}`}>
                    {formatTime(msg.created_at)}
                    {msg.direction === 'out' && <CheckCheck size={11}/>}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef}/>
        </div>

        {/* AI suggestion bar */}
        {aiSuggestion && aiMode === 'suggestion' && activeConvId && (
          <div className="px-4 pb-2">
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-start gap-2">
              <Bot size={14} className="text-indigo-500 flex-shrink-0 mt-0.5"/>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-indigo-600 mb-0.5">Sugerencia IA</p>
                <p className="text-xs text-indigo-800 leading-snug line-clamp-2">{aiSuggestion}</p>
              </div>
              <button onClick={insertSuggestion} className="flex-shrink-0 bg-indigo-600 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
                Insertar
              </button>
            </div>
          </div>
        )}

        {/* Input area */}
        {activeConvId && (
          <div className="p-4 bg-white border-t border-slate-200 flex-shrink-0">
            <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 p-2 rounded-2xl focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
              <button className="p-2 text-slate-400 hover:text-indigo-600 rounded-xl hover:bg-white transition-colors">
                <Paperclip size={18}/>
              </button>
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-2 text-sm text-slate-700 outline-none max-h-32"
                placeholder="Escribe un mensaje... (Enter para enviar)"
              />
              <button
                onClick={sendMessage}
                disabled={!inputText.trim() || sending}
                className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors shadow-sm"
              >
                {sending ? <RefreshCw size={17} className="animate-spin"/> : <Send size={17}/>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* â”€â”€ COL 4: CRM + AI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        className="bg-slate-50 border-l border-slate-200 flex flex-col relative flex-shrink-0"
        style={{ width: col4Width }}
      >
        {/* Resize handle left */}
        <div onMouseDown={startDragCol4} className="absolute left-0 top-0 bottom-0 w-1.5 hover:bg-indigo-400/40 cursor-col-resize bg-transparent z-20 -ml-px"/>

        {/* â”€â”€ CRM TOP PANEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex flex-col bg-white border-b border-slate-200 relative" style={{ height: crmHeight }}>
          {/* Customer header */}
          <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-extrabold text-slate-800 text-sm">{activeConvData?.customer_name || 'Sin cliente vinculado'}</p>
                <p className="text-[10px] text-slate-400">{activeConvData?.customer_email || activeConvData?.customer_phone || 'Sin datos de contacto'}</p>
              </div>
              <div className="flex gap-1">
                {activeConvData?.customer_phone && (
                  <a href={`tel:${activeConvData.customer_phone}`} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                    <Phone size={14}/>
                  </a>
                )}
                {activeConvData?.customer_email && (
                  <a href={`mailto:${activeConvData.customer_email}`} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Mail size={14}/>
                  </a>
                )}
              </div>
            </div>
            {activeConvData?.customer_id ? (
              <a href={`/dashboard/agenda_clientes/${activeConvData.customer_id}`} target="_blank"
                className="flex items-center gap-1 text-[10px] text-indigo-600 hover:underline font-bold">
                <User size={10}/> Ver perfil completo <ExternalLink size={9}/>
              </a>
            ) : (
              <p className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                <AlertCircle size={10}/> ConversaciÃ³n no vinculada a un cliente
              </p>
            )}
          </div>

          {/* CRM Historial */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Historial CRM</span>
              <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">{crmLeads.length} registros</span>
            </div>

            {crmLeads.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <FileText size={24} className="mx-auto mb-2 opacity-30"/>
                <p className="text-[11px]">{activeConvData?.customer_id ? 'Sin leads para este cliente' : 'Vincula el chat a un cliente para ver su historial'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {crmLeads.map(lead => (
                  <button
                    key={lead.id}
                    onClick={() => openLeadDetail(lead)}
                    className="w-full text-left border border-slate-200 rounded-xl overflow-hidden bg-white hover:border-indigo-300 hover:shadow-sm transition-all group"
                  >
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center group-hover:bg-indigo-50/50">
                      <span className="text-[10px] font-black text-slate-700">#{lead.id} {lead.solicitud_tipo || 'Lead'}</span>
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS_COLORS[lead.stage_name || lead.status] || 'bg-slate-100 text-slate-500'}`}>
                        {lead.stage_name || lead.status}
                      </span>
                    </div>
                    <div className="px-3 py-2">
                      {lead.lead_product_name && <p className="text-[10px] text-slate-500 truncate flex items-center gap-1"><Package size={9}/> {lead.lead_product_name}</p>}
                      <div className="flex justify-between items-center mt-1">
                        <p className="text-xs font-black text-slate-800">
                          {lead.value > 0 ? `$${Number(lead.value).toLocaleString('es-CO')}` : 'â€”'}
                        </p>
                        <span className="text-[9px] text-indigo-600 font-bold group-hover:underline flex items-center gap-0.5">
                          Gestionar <ChevronRight size={9}/>
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Resize handle bottom */}
          <div onMouseDown={startDragCrmH} className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-indigo-400/40 bg-transparent z-20"/>
        </div>

        {/* â”€â”€ AI AGENT PANEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-white to-indigo-50/30">
          {/* AI header */}
          <div className="px-4 py-2.5 bg-white border-b border-indigo-100 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-1 rounded-lg">
                <Sparkles className="text-white" size={13}/>
              </div>
              <span className="font-extrabold text-indigo-900 text-sm">Agente IA</span>
              <div className={`w-1.5 h-1.5 rounded-full ${aiMode === 'off' ? 'bg-slate-400' : aiMode === 'auto' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]'}`}/>
            </div>
            {/* Mode toggle */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {(['off', 'suggestion', 'auto'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => toggleAiMode(m)}
                  className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${
                    aiMode === m ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {m === 'off' ? 'Off' : m === 'suggestion' ? 'Suger.' : 'Auto'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Status */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex items-start gap-2">
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                aiMode === 'off' ? 'bg-slate-400'
                : aiMode === 'auto' ? 'bg-emerald-500 animate-pulse'
                : 'bg-amber-400'
              }`}/>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Estado</p>
                <p className="text-xs font-bold text-slate-700 leading-snug">
                  {aiMode === 'off'    ? 'IA desactivada. Solo el asesor responde.' :
                   aiMode === 'auto'   ? 'Modo AUTO: respondiendo automÃ¡ticamente por el asesor.' :
                   'Modo SUGERENCIA: sugiriendo respuestas al asesor.'}
                </p>
              </div>
            </div>

            {/* Context info */}
            {activeConvData && (
              <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-3">
                <p className="text-[9px] font-black text-indigo-700 uppercase mb-1.5">Contexto del cliente</p>
                <div className="space-y-0.5">
                  <p className="text-[10px] text-indigo-800"><span className="font-bold">Canal:</span> {CHANNEL_CONFIG[activeConvData.channel as keyof typeof CHANNEL_CONFIG]?.label || activeConvData.channel}</p>
                  <p className="text-[10px] text-indigo-800"><span className="font-bold">Leads activos:</span> {crmLeads.length}</p>
                  <p className="text-[10px] text-indigo-800"><span className="font-bold">Mensajes:</span> {messages.length}</p>
                  {crmLeads.length > 0 && (
                    <p className="text-[10px] text-indigo-800"><span className="font-bold">Ãšltimo estado:</span> {crmLeads[0].stage_name || crmLeads[0].status}</p>
                  )}
                </div>
              </div>
            )}

            {/* AI suggestion */}
            {aiSuggestion && aiMode !== 'off' && (
              <div className="bg-indigo-600 rounded-2xl shadow-md p-4 text-white">
                <div className="flex items-center gap-1.5 mb-2">
                  <Bot size={12} className="text-indigo-200"/>
                  <span className="text-[9px] font-black text-indigo-200 uppercase">Sugerencia de respuesta</span>
                  {loadingAI && <RefreshCw size={10} className="animate-spin text-indigo-300 ml-auto"/>}
                </div>
                <p className="text-xs font-medium leading-relaxed mb-3">"{aiSuggestion}"</p>
                {aiMode === 'suggestion' && (
                  <div className="flex gap-2">
                    <button onClick={insertSuggestion} className="flex-1 bg-white text-indigo-700 text-[10px] font-black py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                      Insertar en chat
                    </button>
                    <button
                      onClick={async () => {
                        if (!activeConvId) return;
                        await apiFetch(`/chat/conversations/${activeConvId}/reply`, {
                          method: 'POST',
                          body: JSON.stringify({ content: aiSuggestion, is_ai_generated: true, is_auto_sent: true }),
                        });
                        setMessages(prev => [...prev, { id: Date.now(), direction: 'out', content: aiSuggestion, sender_name: 'Agente IA', is_ai_generated: true, created_at: new Date().toISOString() }]);
                      }}
                      className="flex-1 bg-indigo-500 text-white text-[10px] font-black py-1.5 rounded-lg hover:bg-indigo-400 transition-colors border border-indigo-400"
                    >
                      Enviar directo
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* â•â• LEAD DETAIL MODAL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {showLeadModal && selectedLead && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-white border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">Lead #{selectedLead.id}</h3>
                <p className="text-xs text-slate-500">{selectedLead.client || selectedLead.customer_name}</p>
              </div>
              <button onClick={() => setShowLeadModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                <X size={18}/>
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Tipo */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Tipo de Solicitud</label>
                <select
                  value={editLeadForm.solicitud_tipo}
                  onChange={e => setEditLeadForm((f: any) => ({ ...f, solicitud_tipo: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none"
                >
                  {['Nuevo Lead','Solicitud de Cliente','Cotizacion','Pendiente de Pago','Pedido de Venta'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Pipeline stage */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Etapa del Pipeline</label>
                <div className="grid grid-cols-2 gap-2">
                  {crmStages.map(stage => (
                    <button
                      key={stage.id}
                      onClick={() => setEditLeadForm((f: any) => ({ ...f, pipeline_stage_id: stage.id }))}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                        editLeadForm.pipeline_stage_id === stage.id
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-600 hover:border-indigo-300'
                      }`}
                    >
                      {stage.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Producto</label>
                <input
                  value={editLeadForm.lead_product_name}
                  onChange={e => setEditLeadForm((f: any) => ({ ...f, lead_product_name: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  placeholder="Nombre del producto"
                />
              </div>

              {/* Value */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Valor (COP)</label>
                <input
                  type="number"
                  value={editLeadForm.lead_value}
                  onChange={e => setEditLeadForm((f: any) => ({ ...f, lead_value: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">DescripciÃ³n</label>
                <textarea
                  value={editLeadForm.lead_description}
                  onChange={e => setEditLeadForm((f: any) => ({ ...f, lead_description: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
                />
              </div>

              {/* Advisor */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Asesor</label>
                <input
                  value={editLeadForm.advisor_name}
                  onChange={e => setEditLeadForm((f: any) => ({ ...f, advisor_name: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Acciones rÃ¡pidas</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => leadAction(selectedLead, 'to-solicitud')}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-purple-50 border border-purple-200 text-purple-700 rounded-xl text-xs font-bold hover:bg-purple-100 transition-colors"
                  >
                    <MoveRight size={13}/> Crear Solicitud
                  </button>
                  <button
                    onClick={() => leadAction(selectedLead, 'to-cotizacion')}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-xs font-bold hover:bg-amber-100 transition-colors"
                  >
                    <Calculator size={13}/> Crear CotizaciÃ³n
                  </button>
                  <button
                    onClick={() => { if (confirm('Â¿Mover a Pedido de Venta?')) { const s = crmStages.find(s => s.name.toLowerCase().includes('pedido')); if (s) moveLeadToStage(selectedLead, s.id); } }}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors"
                  >
                    <ShoppingCart size={13}/> Crear Pedido
                  </button>
                  <a
                    href="/dashboard/crm"
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors"
                  >
                    <ExternalLink size={13}/> Ir al CRM
                  </a>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowLeadModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
                Cancelar
              </button>
              <button
                onClick={saveLead}
                disabled={savingLead}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-2"
              >
                {savingLead ? <RefreshCw size={14} className="animate-spin"/> : <Check size={14}/>}
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â•â• QUOTATION MODAL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {showQuoteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-sm"><Calculator size={20}/></div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg">Cotizador RÃ¡pido</h3>
                  <p className="text-xs text-slate-500">Motor Financiero TRM</p>
                </div>
              </div>
              <button onClick={() => setShowQuoteModal(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6">
              <form onSubmit={handleCalculate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Costo (USD)', key: 'costUsd', type: 'number', placeholder: '120.00' },
                    { label: 'Descuento (%)', key: 'discount', type: 'number', placeholder: '0' },
                    { label: 'Peso (Libras)', key: 'weightLb', type: 'number', placeholder: '1' },
                    { label: 'TRM del dÃ­a', key: 'trm', type: 'number', placeholder: '4200' },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{label}</label>
                      <input type={type} step="any" value={(quoteForm as any)[key]} onChange={e => setQuoteForm(f => ({ ...f, [key]: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none" placeholder={placeholder}/>
                    </div>
                  ))}
                </div>
                <button type="submit" disabled={isCalculating}
                  className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors flex justify-center items-center gap-2">
                  {isCalculating ? 'Calculando...' : <><ArrowRight size={16}/> Calcular Precio Sugerido</>}
                </button>
              </form>
              {quoteResult && (
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Costo Total', value: `$${quoteResult.total_cost_cop?.toLocaleString('es-CO')}`, style: 'bg-slate-50 border-slate-200 text-slate-700' },
                      { label: 'Precio Sugerido', value: `$${quoteResult.suggested_price_cop?.toLocaleString('es-CO')}`, style: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
                      { label: 'Anticipo', value: `$${quoteResult.advance_payment_cop?.toLocaleString('es-CO')}`, style: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                    ].map(({ label, value, style }) => (
                      <div key={label} className={`p-3 rounded-2xl border text-center ${style}`}>
                        <p className="text-[9px] font-bold uppercase opacity-70 mb-1">{label}</p>
                        <p className="text-base font-extrabold">{value}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={async () => {
                      if (!activeConvId) return;
                      const msg = `ðŸ’° CotizaciÃ³n:\nâ€¢ Costo total: $${quoteResult.total_cost_cop?.toLocaleString('es-CO')} COP\nâ€¢ Precio sugerido: $${quoteResult.suggested_price_cop?.toLocaleString('es-CO')} COP\nâ€¢ Anticipo (50%): $${quoteResult.advance_payment_cop?.toLocaleString('es-CO')} COP`;
                      setInputText(msg);
                      setShowQuoteModal(false);
                    }}
                    className="w-full mt-3 bg-slate-800 text-white font-bold py-2.5 rounded-xl hover:bg-slate-900 transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <Send size={14}/> Enviar cotizaciÃ³n al chat
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

