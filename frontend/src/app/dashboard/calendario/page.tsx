"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus,
  RefreshCw, CheckCircle2, X, Clock, MapPin, User, Trash2,
  Edit3, Video, Phone, Users, FileText, ExternalLink, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

async function apiFetch(path, opts = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
  const res = await fetch(API_URL + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'HTTP ' + res.status); }
  const json = await res.json();
  return json.data ?? json;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const WEEKDAYS_LONG = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const WEEKDAYS_SHORT = ['L','M','X','J','V','S','D'];

const EVENT_TYPES = [
  { value: 'MEETING',   label: 'Reunión',         icon: Users,    color: 'indigo' },
  { value: 'CALL',      label: 'Llamada',          icon: Phone,    color: 'green'  },
  { value: 'VIDEO',     label: 'Videollamada',     icon: Video,    color: 'blue'   },
  { value: 'FOLLOWUP',  label: 'Seguimiento',      icon: RefreshCw,color: 'amber'  },
  { value: 'TASK',      label: 'Tarea',            icon: FileText, color: 'purple' },
  { value: 'DEMO',      label: 'Demo / Presentación', icon: ExternalLink, color: 'rose' },
];

const COLOR_MAP = {
  indigo: { dot: '#6366f1', bg: '#eef2ff', text: '#4338ca', border: '#c7d2fe' },
  green:  { dot: '#22c55e', bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  blue:   { dot: '#3b82f6', bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  amber:  { dot: '#f59e0b', bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  purple: { dot: '#a855f7', bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff' },
  rose:   { dot: '#f43f5e', bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
};

function getTypeColor(eventType) {
  const t = EVENT_TYPES.find(e => e.value === eventType);
  return t ? t.color : 'indigo';
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function toInputDate(d) {
  return d.toISOString().slice(0, 16);
}
function timeUntil(isoStr) {
  const diff = new Date(isoStr).getTime() - Date.now();
  if (diff < 0) return 'Pasado';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `En ${Math.floor(h/24)} días`;
  if (h > 0) return `En ${h}h ${m}m`;
  return `En ${m} min`;
}

// ─── getDays: returns array of Date objects for the month grid (Mon-start) ──
function getDaysGrid(year, month) {
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // Mon=0
  const grid = [];
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, 1 - (startDow - i));
    grid.push({ date: d, inMonth: false });
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    grid.push({ date: new Date(year, month, i), inMonth: true });
  }
  while (grid.length % 7 !== 0) {
    const last = grid[grid.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    grid.push({ date: next, inMonth: false });
  }
  return grid;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ── SYNC helpers (uses Google/MS tokens stored in localStorage) ──────────────
const GOOGLE_CLIENT_ID  = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID  || '';
const MICROSOFT_CLIENT_ID = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID || '';

function openGoogleOAuth() {
  const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar');
  const redirect = encodeURIComponent(window.location.origin + '/api/oauth/google/callback');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${redirect}&response_type=token&scope=${scope}`;
  if (!GOOGLE_CLIENT_ID) {
    toast.error('Configura NEXT_PUBLIC_GOOGLE_CLIENT_ID en .env.local para habilitar Google Calendar.');
    return null;
  }
  return window.open(url, 'google_oauth', 'width=500,height=600');
}
function openMicrosoftOAuth() {
  const scope = encodeURIComponent('Calendars.ReadWrite offline_access');
  const redirect = encodeURIComponent(window.location.origin + '/api/oauth/microsoft/callback');
  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${MICROSOFT_CLIENT_ID}&redirect_uri=${redirect}&response_type=token&scope=${scope}`;
  if (!MICROSOFT_CLIENT_ID) {
    toast.error('Configura NEXT_PUBLIC_MICROSOFT_CLIENT_ID en .env.local para habilitar Microsoft Outlook.');
    return null;
  }
  return window.open(url, 'ms_oauth', 'width=500,height=600');
}

// ── Default empty event form ──────────────────────────────────────────────────
function defaultForm(date) {
  const d = date || new Date();
  d.setMinutes(0, 0, 0);
  const start = new Date(d);
  const end = new Date(d);
  end.setHours(end.getHours() + 1);
  return {
    title: '', description: '', event_type: 'MEETING', location: '',
    color: 'indigo', customer_id: '', customer_name: '',
    start_datetime: toInputDate(start), end_datetime: toInputDate(end),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
export default function CalendarioPage() {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView]   = useState('mes'); // mes | semana | dia
  const [events, setEvents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [form, setForm]   = useState(defaultForm(null));
  const [syncGoogle, setSyncGoogle]   = useState(() => typeof window !== 'undefined' ? !!localStorage.getItem('google_cal_connected') : false);
  const [syncMicrosoft, setSyncMicrosoft] = useState(() => typeof window !== 'undefined' ? !!localStorage.getItem('ms_cal_connected') : false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const grid = getDaysGrid(year, month);

  // Load events
  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/crm/events?month=${month + 1}&year=${year}`);
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error('Error cargando eventos: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    apiFetch('/crm/customers').then(d => setCustomers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Navigate months
  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }
  function goToday()   { setYear(today.getFullYear()); setMonth(today.getMonth()); }

  // Events for a specific day
  function eventsOnDay(date) {
    return events.filter(e => e.start_datetime && isSameDay(new Date(e.start_datetime), date));
  }

  // Upcoming events (next 7 days)
  const upcoming = [...events]
    .filter(e => new Date(e.start_datetime) >= today)
    .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
    .slice(0, 8);

  // Open form to create event on a clicked day
  function openCreateOnDay(date) {
    setSelectedEvent(null);
    setEditingEvent(null);
    setForm(defaultForm(date));
    setShowForm(true);
  }

  function openCreate() {
    setSelectedEvent(null);
    setEditingEvent(null);
    setForm(defaultForm(selectedDate || new Date()));
    setShowForm(true);
  }

  function openEdit(ev) {
    setEditingEvent(ev);
    setForm({
      title: ev.title || '',
      description: ev.description || '',
      event_type: ev.event_type || 'MEETING',
      location: ev.location || '',
      color: ev.color || 'indigo',
      customer_id: ev.customer_id || '',
      customer_name: ev.customer_name || '',
      start_datetime: ev.start_datetime ? ev.start_datetime.slice(0, 16) : '',
      end_datetime: ev.end_datetime ? ev.end_datetime.slice(0, 16) : '',
    });
    setShowForm(true);
    setSelectedEvent(null);
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('El título es obligatorio'); return; }
    if (!form.start_datetime) { toast.error('La fecha/hora de inicio es obligatoria'); return; }
    setIsSaving(true);
    const tid = toast.loading(editingEvent ? 'Guardando cambios...' : 'Creando evento...');
    try {
      const payload = {
        ...form,
        customer_id: form.customer_id ? Number(form.customer_id) : null,
      };
      let saved;
      if (editingEvent) {
        saved = await apiFetch(`/crm/events/${editingEvent.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setEvents(prev => prev.map(e => e.id === saved.id ? saved : e));
        toast.success('Evento actualizado ✅', { id: tid });
      } else {
        saved = await apiFetch('/crm/events', { method: 'POST', body: JSON.stringify(payload) });
        setEvents(prev => [saved, ...prev]);
        toast.success('Evento creado ✅', { id: tid });
      }
      setShowForm(false);
      setEditingEvent(null);
    } catch (e) {
      toast.error(e.message, { id: tid });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(ev) {
    if (!confirm(`¿Eliminar el evento "${ev.title}"?`)) return;
    try {
      await apiFetch(`/crm/events/${ev.id}`, { method: 'DELETE' });
      setEvents(prev => prev.filter(e => e.id !== ev.id));
      setSelectedEvent(null);
      toast.success('Evento eliminado');
    } catch (e) { toast.error(e.message); }
  }

  // Sync handlers
  function handleGoogleSync() {
    if (syncGoogle) {
      if (confirm('¿Desconectar Google Calendar?')) {
        localStorage.removeItem('google_cal_connected');
        setSyncGoogle(false);
        toast('Google Calendar desconectado');
      }
      return;
    }
    if (!GOOGLE_CLIENT_ID) {
      // Show instructions toast
      toast((t) => (
        <span className="text-sm">
          Para conectar Google Calendar, agrega <b>NEXT_PUBLIC_GOOGLE_CLIENT_ID</b> en <code>.env.local</code> y registra la app en Google Cloud Console.
        </span>
      ), { duration: 6000, icon: 'ℹ️' });
      // Simulate for demo
      if (confirm('¿Simular conexión con Google Calendar? (Demo — sin OAuth real)')) {
        localStorage.setItem('google_cal_connected', '1');
        setSyncGoogle(true);
        setShowSyncModal(false);
        toast.success('Google Calendar conectado ✅ (modo demo)');
      }
      return;
    }
    const popup = openGoogleOAuth();
    if (popup) {
      const interval = setInterval(() => {
        try {
          if (popup.closed) { clearInterval(interval); return; }
          const hash = popup.location.hash;
          if (hash.includes('access_token')) {
            const token = new URLSearchParams(hash.replace('#', '')).get('access_token');
            localStorage.setItem('google_cal_connected', '1');
            localStorage.setItem('google_access_token', token);
            setSyncGoogle(true);
            setShowSyncModal(false);
            popup.close();
            clearInterval(interval);
            toast.success('Google Calendar sincronizado ✅');
          }
        } catch (e) { /* cross-origin */ }
      }, 500);
    }
  }

  function handleMicrosoftSync() {
    if (syncMicrosoft) {
      if (confirm('¿Desconectar Microsoft Outlook?')) {
        localStorage.removeItem('ms_cal_connected');
        setSyncMicrosoft(false);
        toast('Microsoft Outlook desconectado');
      }
      return;
    }
    if (!MICROSOFT_CLIENT_ID) {
      toast((t) => (
        <span className="text-sm">
          Para conectar Outlook, agrega <b>NEXT_PUBLIC_MICROSOFT_CLIENT_ID</b> en <code>.env.local</code> y registra la app en Azure AD.
        </span>
      ), { duration: 6000, icon: 'ℹ️' });
      if (confirm('¿Simular conexión con Microsoft Outlook? (Demo — sin OAuth real)')) {
        localStorage.setItem('ms_cal_connected', '1');
        setSyncMicrosoft(true);
        setShowSyncModal(false);
        toast.success('Microsoft Outlook conectado ✅ (modo demo)');
      }
      return;
    }
    const popup = openMicrosoftOAuth();
    if (popup) {
      const interval = setInterval(() => {
        try {
          if (popup.closed) { clearInterval(interval); return; }
          const hash = popup.location.hash;
          if (hash.includes('access_token')) {
            const token = new URLSearchParams(hash.replace('#', '')).get('access_token');
            localStorage.setItem('ms_cal_connected', '1');
            localStorage.setItem('ms_access_token', token);
            setSyncMicrosoft(true);
            setShowSyncModal(false);
            popup.close();
            clearInterval(interval);
            toast.success('Microsoft Outlook sincronizado ✅');
          }
        } catch (e) {}
      }, 500);
    }
  }

  const syncCount = (syncGoogle ? 1 : 0) + (syncMicrosoft ? 1 : 0);

  return (
    <div className="h-full w-full bg-slate-50 flex flex-col overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
            <CalendarIcon size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Calendario</h1>
            <p className="text-slate-500 text-xs mt-0.5">{events.length} eventos este mes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Sync status badge */}
          <button onClick={() => setShowSyncModal(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border transition-all ${syncCount > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {syncCount > 0 ? <CheckCircle2 size={15} /> : <RefreshCw size={15} />}
            {syncCount === 0 ? 'Sincronizar' : `${syncCount} conectado${syncCount > 1 ? 's' : ''}`}
          </button>
          {/* View switcher */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {[['mes','Mes'],['semana','Semana'],['dia','Día']].map(([v,l]) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-all ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
            ))}
          </div>
          <button onClick={loadEvents} className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors" title="Recargar"><RefreshCw size={17} /></button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-purple-200">
            <Plus size={17} /> Nuevo Evento
          </button>
        </div>
      </div>

      {/* ── Body: sidebar + main ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <div className="w-72 border-r border-slate-200 bg-white flex flex-col overflow-y-auto flex-shrink-0">

          {/* Mini calendar nav */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-slate-800 text-sm">{MONTHS[month]} {year}</span>
              <div className="flex gap-1">
                <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><ChevronLeft size={16}/></button>
                <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><ChevronRight size={16}/></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {WEEKDAYS_SHORT.map(d => <div key={d} className="text-[10px] font-bold text-slate-400 py-1">{d}</div>)}
              {grid.map((cell, i) => {
                const isToday = isSameDay(cell.date, today);
                const hasEvt = eventsOnDay(cell.date).length > 0;
                const isSel = selectedDate && isSameDay(cell.date, selectedDate);
                return (
                  <button key={i} onClick={() => setSelectedDate(cell.date)}
                    className={`w-8 h-8 mx-auto rounded-full text-xs font-medium flex items-center justify-center transition-all relative
                      ${isToday ? 'bg-purple-600 text-white shadow-md font-bold' : isSel ? 'bg-purple-100 text-purple-700 font-bold' : cell.inMonth ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300'}`}>
                    {cell.date.getDate()}
                    {hasEvt && !isToday && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-purple-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sync Status */}
          <div className="p-4 border-b border-slate-100">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Sincronización</h4>
            <div className="space-y-2">
              {/* Google */}
              <button onClick={handleGoogleSync}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-left ${syncGoogle ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                <div className="flex items-center gap-2.5">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" className="w-5 h-5" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">Google Calendar</p>
                    <p className="text-[10px] text-slate-400">{syncGoogle ? 'Conectado ✓' : 'No conectado'}</p>
                  </div>
                </div>
                {syncGoogle ? <CheckCircle2 size={14} className="text-emerald-500" /> : <ChevronRight size={14} className="text-slate-400" />}
              </button>
              {/* Microsoft */}
              <button onClick={handleMicrosoftSync}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-left ${syncMicrosoft ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                <div className="flex items-center gap-2.5">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/d/df/Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg" alt="Microsoft" className="w-5 h-5" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">Microsoft Outlook</p>
                    <p className="text-[10px] text-slate-400">{syncMicrosoft ? 'Conectado ✓' : 'No conectado'}</p>
                  </div>
                </div>
                {syncMicrosoft ? <CheckCircle2 size={14} className="text-emerald-500" /> : <ChevronRight size={14} className="text-slate-400" />}
              </button>
            </div>
          </div>

          {/* Upcoming events */}
          <div className="flex-1 p-4 overflow-y-auto">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Próximos eventos</h4>
            {loading && <div className="flex items-center gap-2 text-slate-400 text-xs py-4 justify-center"><RefreshCw size={14} className="animate-spin" /> Cargando...</div>}
            {!loading && upcoming.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Sin eventos próximos.<br/>¡Crea el primero!</p>}
            <div className="space-y-2">
              {upcoming.map(ev => {
                const c = COLOR_MAP[ev.color] || COLOR_MAP.indigo;
                return (
                  <button key={ev.id} onClick={() => setSelectedEvent(ev)}
                    className="w-full text-left p-2.5 rounded-xl border transition-all hover:shadow-sm"
                    style={{ backgroundColor: c.bg, borderColor: c.border }}>
                    <p className="text-xs font-bold truncate" style={{ color: c.text }}>{ev.title}</p>
                    {ev.customer_name && <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5"><User size={9}/> {ev.customer_name}</p>}
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-slate-500 flex items-center gap-1"><Clock size={9}/> {formatTime(ev.start_datetime)}</p>
                      <p className="text-[10px] font-bold" style={{ color: c.text }}>{timeUntil(ev.start_datetime)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main calendar grid */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">

          {/* Month nav bar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 flex-shrink-0 bg-slate-50">
            <div className="flex items-center gap-3">
              <button onClick={goToday} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-sm">Hoy</button>
              <button onClick={prevMonth} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"><ChevronLeft size={18}/></button>
              <h2 className="text-lg font-extrabold text-slate-800 w-52 text-center">{MONTHS[month]} {year}</h2>
              <button onClick={nextMonth} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"><ChevronRight size={18}/></button>
            </div>
            {selectedDate && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-600">{formatDate(selectedDate.toISOString())}</span>
                <button onClick={() => openCreateOnDay(selectedDate)}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                  <Plus size={13} /> Agregar evento
                </button>
                <button onClick={() => setSelectedDate(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"><X size={14}/></button>
              </div>
            )}
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-slate-100 flex-shrink-0">
            {WEEKDAYS_LONG.map(d => (
              <div key={d} className="py-2.5 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">{d}</div>
            ))}
          </div>

          {/* Calendar grid cells */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-7" style={{ gridAutoRows: '120px' }}>
              {grid.map((cell, i) => {
                const dayEvs = eventsOnDay(cell.date);
                const isToday = isSameDay(cell.date, today);
                const isSel = selectedDate && isSameDay(cell.date, selectedDate);
                return (
                  <div key={i}
                    onClick={() => setSelectedDate(cell.date)}
                    onDoubleClick={() => openCreateOnDay(cell.date)}
                    className={`border-r border-b border-slate-100 p-1.5 cursor-pointer transition-colors overflow-hidden
                      ${!cell.inMonth ? 'bg-slate-50/60' : isSel ? 'bg-purple-50/60' : 'hover:bg-slate-50'}`}>
                    {/* Day number */}
                    <div className="flex justify-end mb-1">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors
                        ${isToday ? 'bg-purple-600 text-white shadow' : !cell.inMonth ? 'text-slate-300' : isSel ? 'text-purple-700' : 'text-slate-600'}`}>
                        {cell.date.getDate()}
                      </span>
                    </div>
                    {/* Events in cell */}
                    <div className="space-y-0.5 overflow-hidden">
                      {dayEvs.slice(0, 3).map(ev => {
                        const c = COLOR_MAP[ev.color] || COLOR_MAP.indigo;
                        return (
                          <div key={ev.id}
                            onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold truncate cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: c.bg, color: c.text, borderLeft: `3px solid ${c.dot}` }}>
                            {formatTime(ev.start_datetime)} {ev.title}
                          </div>
                        );
                      })}
                      {dayEvs.length > 3 && (
                        <div className="text-[10px] text-slate-400 font-bold pl-1">+{dayEvs.length - 3} más</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          PANEL — EVENT DETAIL (slide-in)
      ══════════════════════════════════════════════════════════════════════ */}
      {selectedEvent && (
        <>
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={() => setSelectedEvent(null)} />
          <div className="fixed top-0 right-0 bottom-0 w-96 bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col">
            {(() => {
              const c = COLOR_MAP[selectedEvent.color] || COLOR_MAP.indigo;
              const TypeIcon = EVENT_TYPES.find(t => t.value === selectedEvent.event_type)?.icon || Users;
              return (
                <>
                  {/* Header */}
                  <div className="p-5 border-b border-slate-100 flex items-start justify-between" style={{ backgroundColor: c.bg }}>
                    <div className="flex gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: c.dot + '20', color: c.dot }}>
                        <TypeIcon size={18} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-black text-slate-800 text-base truncate">{selectedEvent.title}</h2>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md mt-1 inline-block" style={{ backgroundColor: c.dot + '20', color: c.text }}>
                          {EVENT_TYPES.find(t => t.value === selectedEvent.event_type)?.label || selectedEvent.event_type}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => setSelectedEvent(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 ml-2 flex-shrink-0"><X size={16} /></button>
                  </div>

                  {/* Detail */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {[
                      ['Inicio', formatDate(selectedEvent.start_datetime) + ' · ' + formatTime(selectedEvent.start_datetime), Clock],
                      selectedEvent.end_datetime ? ['Fin', formatDate(selectedEvent.end_datetime) + ' · ' + formatTime(selectedEvent.end_datetime), Clock] : null,
                      selectedEvent.location ? ['Lugar', selectedEvent.location, MapPin] : null,
                      selectedEvent.customer_name ? ['Cliente', selectedEvent.customer_name, User] : null,
                    ].filter(Boolean).map(([label, val, Icon]) => (
                      <div key={label} className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0"><Icon size={14} /></div>
                        <div><p className="text-xs font-bold text-slate-400">{label}</p><p className="text-sm font-medium text-slate-700">{val}</p></div>
                      </div>
                    ))}
                    {selectedEvent.description && (
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 mb-1">Descripción</p>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedEvent.description}</p>
                      </div>
                    )}
                    {selectedEvent.sync_source && selectedEvent.sync_source !== 'INTERNAL' && (
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-medium"><CheckCircle2 size={12} className="text-emerald-500" /> Sincronizado con {selectedEvent.sync_source}</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="p-4 border-t border-slate-100 grid grid-cols-2 gap-2">
                    <button onClick={() => openEdit(selectedEvent)}
                      className="flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 text-sm transition-colors">
                      <Edit3 size={14} /> Editar
                    </button>
                    <button onClick={() => handleDelete(selectedEvent)}
                      className="flex items-center justify-center gap-2 py-2.5 bg-rose-50 border border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-100 text-sm transition-colors">
                      <Trash2 size={14} /> Eliminar
                    </button>
                    {selectedEvent.customer_id && (
                      <Link href="/dashboard/agenda" className="col-span-2 flex items-center justify-center gap-2 py-2.5 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 text-sm transition-colors">
                        <User size={14} /> Ver cliente en Agenda
                      </Link>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL — CREAR / EDITAR EVENTO
      ══════════════════════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-black text-slate-800">{editingEvent ? 'Editar Evento' : 'Nuevo Evento'}</h2>
              <button onClick={() => { setShowForm(false); setEditingEvent(null); }} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={18}/></button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Título *</label>
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                  placeholder="Ej: Reunión con cliente, Llamada de seguimiento..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-purple-500" />
              </div>

              {/* Type & Color */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Tipo</label>
                  <select value={form.event_type} onChange={e => {
                    const t = EVENT_TYPES.find(et => et.value === e.target.value);
                    setForm({...form, event_type: e.target.value, color: t?.color || 'indigo'});
                  }} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-purple-500 bg-white">
                    {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Color</label>
                  <div className="flex gap-2 pt-1.5">
                    {Object.entries(COLOR_MAP).map(([k, c]) => (
                      <button key={k} onClick={() => setForm({...form, color: k})}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === k ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c.dot }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Inicio *</label>
                  <input type="datetime-local" value={form.start_datetime} onChange={e => setForm({...form, start_datetime: e.target.value})}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Fin</label>
                  <input type="datetime-local" value={form.end_datetime} onChange={e => setForm({...form, end_datetime: e.target.value})}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500" />
                </div>
              </div>

              {/* Cliente */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Cliente (opcional)</label>
                <select value={form.customer_id} onChange={e => {
                  const cust = customers.find(c => c.id === Number(e.target.value));
                  setForm({...form, customer_id: e.target.value, customer_name: cust ? `${cust.first_name} ${cust.last_name}` : ''});
                }} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-purple-500 bg-white">
                  <option value="">Sin cliente vinculado</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>

              {/* Lugar */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Lugar / Enlace</label>
                <input value={form.location} onChange={e => setForm({...form, location: e.target.value})}
                  placeholder="Ej: Oficina Medellín, https://meet.google.com/..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500" />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Notas / Descripción</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  rows={3} placeholder="Agenda, temas a tratar, recordatorios..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 resize-none" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowForm(false); setEditingEvent(null); }} className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={isSaving}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm shadow-md shadow-purple-200 disabled:opacity-60 transition-all">
                {isSaving ? 'Guardando...' : editingEvent ? 'Guardar cambios' : 'Crear Evento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL — SYNC
      ══════════════════════════════════════════════════════════════════════ */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-slate-800">Sincronizar Calendario</h2>
              <button onClick={() => setShowSyncModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={18}/></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Conecta con tu proveedor de calendario para sincronizar eventos de forma bidireccional.</p>
            <div className="space-y-3">
              <button onClick={() => { setShowSyncModal(false); handleGoogleSync(); }}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${syncGoogle ? 'bg-emerald-50 border-emerald-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" className="w-6 h-6" />
                  <div className="text-left">
                    <p className="font-bold text-slate-700 text-sm">Google Calendar</p>
                    <p className="text-xs text-slate-400">{syncGoogle ? 'Conectado — click para desconectar' : 'Conectar con tu cuenta Google'}</p>
                  </div>
                </div>
                {syncGoogle ? <CheckCircle2 size={18} className="text-emerald-500" /> : <ChevronRight size={18} className="text-slate-400" />}
              </button>
              <button onClick={() => { setShowSyncModal(false); handleMicrosoftSync(); }}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${syncMicrosoft ? 'bg-emerald-50 border-emerald-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/d/df/Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg" alt="Microsoft" className="w-6 h-6" />
                  <div className="text-left">
                    <p className="font-bold text-slate-700 text-sm">Microsoft Outlook</p>
                    <p className="text-xs text-slate-400">{syncMicrosoft ? 'Conectado — click para desconectar' : 'Conectar con tu cuenta Microsoft'}</p>
                  </div>
                </div>
                {syncMicrosoft ? <CheckCircle2 size={18} className="text-emerald-500" /> : <ChevronRight size={18} className="text-slate-400" />}
              </button>
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-start gap-2 text-xs text-slate-400">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  <p>La sincronización requiere <b>NEXT_PUBLIC_GOOGLE_CLIENT_ID</b> y <b>NEXT_PUBLIC_MICROSOFT_CLIENT_ID</b> configurados en <code>.env.local</code>. Sin ellas, el flujo corre en modo demo.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
