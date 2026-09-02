'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  FileText, ShieldAlert, TrendingUp, Clock, AlertTriangle,
  CheckCircle2, Search, Plus, X, User, Phone, Mail, MapPin,
  ExternalLink, RefreshCw, ArrowRight, Activity, ChevronRight,
  MoreVertical, DollarSign, MessageCircle, Edit2, Save, Trash2,
  Package, Send, AlertCircle, ChevronDown
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers as any || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

const SUB_MODULES = [
  { name: 'Solicitud',      path: '/dashboard/ventas/solicitud' },
  { name: 'Cotizacion',     path: '/dashboard/ventas/cotizacion' },
  { name: 'Venta',          path: '/dashboard/ventas/venta' },
  { name: 'Exportar Dia',   path: '/dashboard/ventas/exportar-dia' },
  { name: 'Exportar Rango', path: '/dashboard/ventas/exportar-rango' },
  { name: 'Sincronizacion', path: '/dashboard/ventas/sincronizacion' },
  { name: 'Proyecciones',   path: '/dashboard/ventas/proyecciones' },
];

const TIPOS_SC = [
  'Cotizacion de Producto',
  'Seguimiento',
  'Devolucion y Garantia',
  'Soporte Tecnico',
  'Nuevo Lead',
];

const MODALIDADES_PAGO = [
  'Contado',
  '60/40 (60% anticipo - 40% pendiente)',
  'Credito 30 dias',
  'Credito 60 dias',
  'Otro',
];

const ESTADOS_SC: Record<string, { label: string; color: string; bg: string; border: string }> = {
  BORRADOR:               { label: 'Borrador',              color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  PENDIENTE_CONFIRMACION: { label: 'Pend. confirmacion',    color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  CONFIRMADA:             { label: 'Confirmada',            color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' },
  CANCELADA:              { label: 'Cancelada',             color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
};

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADOS_SC[estado] || { label: estado, color: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border"
      style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {estado === 'BORRADOR'               && <Clock size={10}/>}
      {estado === 'PENDIENTE_CONFIRMACION' && <AlertTriangle size={10}/>}
      {estado === 'CONFIRMADA'             && <CheckCircle2 size={10}/>}
      {estado === 'CANCELADA'              && <X size={10}/>}
      {cfg.label}
    </span>
  );
}

function Toast({ msg, type, onClose }: { msg: string; type: 'ok'|'err'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[100] px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 max-w-sm ${type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
      {type === 'ok' ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
      <span>{msg}</span>
      <button onClick={onClose} className="ml-1"><X size={14}/></button>
    </div>
  );
}

const fDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
const fCOP = (v: number | null | undefined) => {
  const n = Number(v) || 0;
  return n > 0 ? `$${n.toLocaleString('es-CO')}` : '-';
};

function TipoBadge({ tipo }: { tipo: string }) {
  const colors: Record<string, string> = {
    'Cotizacion de Producto': 'bg-indigo-100 text-indigo-700',
    'Seguimiento':            'bg-blue-100 text-blue-700',
    'Devolucion y Garantia':  'bg-orange-100 text-orange-700',
    'Soporte Tecnico':        'bg-purple-100 text-purple-700',
    'Nuevo Lead':             'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${colors[tipo] || 'bg-slate-100 text-slate-600'}`}>
      {tipo || 'Sin tipo'}
    </span>
  );
}

function ActionDot({ action }: { action: string }) {
  const colors: Record<string, string> = {
    CREATED: '#6366f1', ESTADO_CHANGED: '#f59e0b', NOTE_ADDED: '#3b82f6',
    CONFIRMED: '#059669', CANCELLED: '#ef4444', UPDATED: '#8b5cf6',
  };
  return <div className="absolute left-0 top-2 w-4 h-4 rounded-full border-2"
    style={{ backgroundColor: colors[action] || '#94a3b8', borderColor: 'white' }} />;
}

// ── Product Not Found Modal ──────────────────────────────────────────────────
function ProductNotFoundModal({
  productName, onConfirm, onCancel
}: { productName: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Package className="text-amber-600" size={24}/>
        </div>
        <h3 className="font-extrabold text-lg text-slate-900 mb-2">Producto no encontrado</h3>
        <p className="text-slate-600 text-sm mb-1">
          El producto <strong className="text-slate-900">"{productName}"</strong> no existe en la base de datos.
        </p>
        <p className="text-slate-500 text-xs mb-6">
          ¿Deseas continuar con este nombre de todas formas? Se anotara en las notas para cotizarlo despues.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50">
            No, Cancelar
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 shadow-md">
            Si, Continuar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Product Autocomplete ─────────────────────────────────────────────────────
function ProductSearch({
  value, onChange, onSelect, onConfirmNew
}: { value: string; onChange: (v: string) => void; onSelect: (p: any) => void; onConfirmNew: (name: string) => void }) {
  const [results, setResults] = useState<any[]>([]);
  const [showNotFoundModal, setShowNotFoundModal] = useState(false);
  const [open, setOpen] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const timer = useRef<any>(null);

  function handleInput(v: string) {
    onChange(v);
    setShowNotFoundModal(false);
    setOpen(false);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const d = await apiFetch(`/crm/products/search?q=${encodeURIComponent(v)}&limit=8`);
        const list = Array.isArray(d) ? d : (d?.data ?? []);
        setResults(list);
        setOpen(true);
        if (list.length === 0 && v.length > 2) {
          setPendingName(v);
          setShowNotFoundModal(true);
        }
      } catch { setResults([]); }
    }, 300);
  }

  return (
    <div className="relative">
      <input type="text" value={value} onChange={e => handleInput(e.target.value)}
        placeholder="Buscar producto en catalogo..."
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
          {results.map((p: any) => (
            <button key={p.id || p.name} type="button" onClick={() => { onSelect(p); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm border-b border-slate-50 last:border-0">
              <span className="font-bold text-slate-800">{p.name || p.product_name}</span>
              {p.sku && <span className="ml-2 text-xs text-slate-400">SKU: {p.sku}</span>}
            </button>
          ))}
        </div>
      )}
      {showNotFoundModal && (
        <ProductNotFoundModal
          productName={pendingName}
          onConfirm={() => { onConfirmNew(pendingName); setShowNotFoundModal(false); }}
          onCancel={() => { onChange(''); setShowNotFoundModal(false); setPendingName(''); }}
        />
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function SolicitudesPage() {
  const [solicitudes,  setSolicitudes]  = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [activeTab,    setActiveTab]    = useState('Activas');
  const [selected,     setSelected]     = useState<any | null>(null);
  const [showCreate,   setShowCreate]   = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [confirming,   setConfirming]   = useState(false);
  const [toast,        setToast]        = useState<{ msg: string; type: 'ok'|'err' } | null>(null);
  const [currentUser,  setCurrentUser]  = useState('');

  // Panel state
  const [editMode,     setEditMode]     = useState(false);
  const [editForm,     setEditForm]     = useState<any>({});
  const [savingEdit,   setSavingEdit]   = useState(false);

  // Create form
  const [form, setForm] = useState({
    advisor_name: '', tipo_solicitud: 'Cotizacion de Producto',
    modalidad_pago: 'Contado', notas: '', dias_vencimiento: 30,
  });
  const [prodName, setProdName] = useState('');
  const [prodQty,  setProdQty]  = useState(1);
  const [productos, setProductos] = useState<any[]>([]);

  // Customer autocomplete
  const [custSearch,  setCustSearch]  = useState('');
  const [custResults, setCustResults] = useState<any[]>([]);
  const [selectedCust,setSelectedCust]= useState<any | null>(null);
  const custTimer = useRef<any>(null);

  const showToast = (msg: string, type: 'ok'|'err' = 'ok') => setToast({ msg, type });

  useEffect(() => {
    const u = localStorage.getItem('user_name') || localStorage.getItem('username') || '';
    setCurrentUser(u);
    setForm(f => ({ ...f, advisor_name: u }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch('/ventas/solicitudes?limit=200');
      setSolicitudes(Array.isArray(d) ? d : (d?.data ?? []));
    } catch { setSolicitudes([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function loadDetail(id: number) {
    try {
      const d = await apiFetch(`/ventas/solicitudes/${id}`);
      setSelected(d);
      setEditForm({
        advisor_name:     d.advisor_name || '',
        tipo_solicitud:   d.tipo_solicitud || 'Cotizacion de Producto',
        modalidad_pago:   d.modalidad_pago || 'Contado',
        notas:            d.notas || '',
        fecha_vencimiento: d.fecha_vencimiento ? d.fecha_vencimiento.split('T')[0] : '',
      });
    } catch (err: any) { showToast('Error al cargar: ' + err.message, 'err'); }
  }

  function onCustSearch(q: string) {
    setCustSearch(q); setSelectedCust(null);
    if (custTimer.current) clearTimeout(custTimer.current);
    if (!q.trim()) { setCustResults([]); return; }
    custTimer.current = setTimeout(async () => {
      const d = await apiFetch(`/crm/customers/search?q=${encodeURIComponent(q)}`).catch(() => []);
      setCustResults(Array.isArray(d) ? d : (d?.data ?? []));
    }, 300);
  }

  async function saveEdit() {
    if (!selected) return;
    setSavingEdit(true);
    try {
      const body: any = { ...editForm, updated_by: currentUser };
      if (editForm.fecha_vencimiento) {
        body.fecha_vencimiento = new Date(editForm.fecha_vencimiento + 'T12:00:00').toISOString();
      }
      const d = await apiFetch(`/ventas/solicitudes/${selected.id}`, {
        method: 'PATCH', body: JSON.stringify(body),
      });
      setSelected((prev: any) => ({ ...prev, ...d }));
      setSolicitudes(prev => prev.map(s => s.id === selected.id ? { ...s, ...d } : s));
      setEditMode(false);
      showToast('Solicitud actualizada');
    } catch (err: any) { showToast('Error: ' + err.message, 'err'); }
    setSavingEdit(false);
  }

  async function changeEstado(newEstado: string) {
    if (!selected) return;
    if (newEstado === 'CANCELADA' && !window.confirm('Cancelar esta solicitud. ¿Estas seguro?')) return;
    setSaving(true);
    try {
      await apiFetch(`/ventas/solicitudes/${selected.id}`, {
        method: 'PATCH', body: JSON.stringify({ estado: newEstado, updated_by: currentUser }),
      });
      await loadDetail(selected.id);
      setSolicitudes(prev => prev.map(s => s.id === selected.id ? { ...s, estado: newEstado } : s));
      showToast(`Estado cambiado a ${ESTADOS_SC[newEstado]?.label || newEstado}`);
    } catch (err: any) { showToast('Error: ' + err.message, 'err'); }
    setSaving(false);
  }

  async function confirmarSC() {
    if (!selected) return;
    setConfirming(true);
    try {
      const d = await apiFetch(`/ventas/solicitudes/${selected.id}/confirmar`, {
        method: 'POST', body: JSON.stringify({ user_name: currentUser }),
      });
      const cotNumero = d?.cotizacion?.numero || d?.sc?.numero || '';
      showToast(`Cotizacion ${cotNumero} creada exitosamente`);
      await loadDetail(selected.id);
      load();
    } catch (err: any) { showToast('Error: ' + err.message, 'err'); }
    setConfirming(false);
  }

  async function createSolicitud(e: React.FormEvent) {
    e.preventDefault();
    if (!custSearch && !selectedCust) { showToast('Selecciona un cliente', 'err'); return; }
    setSaving(true);
    try {
      const prodsToSend = productos.length > 0 ? productos : (prodName ? [{ product_name: prodName, qty: prodQty, unit_price_cop: 0 }] : []);
      await apiFetch('/ventas/solicitudes', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          customer_id:       selectedCust?.id || null,
          customer_name:     selectedCust ? `${selectedCust.first_name} ${selectedCust.last_name}`.trim() : custSearch,
          customer_phone:    selectedCust?.phone || '',
          customer_email:    selectedCust?.email || '',
          customer_address:  selectedCust?.address || '',
          productos:         prodsToSend,
          created_by:        currentUser,
        }),
      });
      showToast('Solicitud creada exitosamente');
      setShowCreate(false);
      setSelectedCust(null); setCustSearch(''); setCustResults([]);
      setProductos([]); setProdName(''); setProdQty(1);
      setForm({ advisor_name: currentUser, tipo_solicitud: 'Cotizacion de Producto', modalidad_pago: 'Contado', notas: '', dias_vencimiento: 30 });
      load();
    } catch (err: any) { showToast('Error: ' + err.message, 'err'); }
    setSaving(false);
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalActivas    = solicitudes.filter(s => s.estado === 'BORRADOR' || s.estado === 'PENDIENTE_CONFIRMACION').length;
  const totalConfirmadas= solicitudes.filter(s => s.estado === 'CONFIRMADA').length;
  const sinAtender = solicitudes.filter(s => {
    if (s.estado !== 'BORRADOR') return false;
    return (Date.now() - new Date(s.fecha_solicitud).getTime()) / 3600000 > 48;
  }).length;
  const vencidas = solicitudes.filter(s => {
    if (s.estado === 'CANCELADA' || s.estado === 'CONFIRMADA') return false;
    return s.fecha_vencimiento && new Date(s.fecha_vencimiento) < new Date();
  }).length;

  const filtered = solicitudes.filter(sc => {
    const ms = !search ||
      sc.numero?.toLowerCase().includes(search.toLowerCase()) ||
      sc.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      sc.advisor_name?.toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeTab === 'Activas')     return sc.estado === 'BORRADOR' || sc.estado === 'PENDIENTE_CONFIRMACION';
    if (activeTab === 'Confirmadas') return sc.estado === 'CONFIRMADA';
    if (activeTab === 'Canceladas')  return sc.estado === 'CANCELADA';
    return true;
  });

  const isCotizacion = form.tipo_solicitud === 'Cotizacion de Producto';

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)}/>}

      {/* Sub-module nav */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Ventas:</span>
        {SUB_MODULES.map(mod => (
          <Link key={mod.name} href={mod.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${
              mod.path === '/dashboard/ventas/solicitud'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 border-transparent hover:border-indigo-200'
            }`}>{mod.name}
          </Link>
        ))}
      </div>

      {/* Alert Banner */}
      {(sinAtender > 0 || vencidas > 0) && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-3 flex items-start gap-4">
          <ShieldAlert className="text-rose-600 shrink-0 mt-0.5" size={20}/>
          <div className="flex-1">
            <h4 className="text-sm font-black text-rose-800">ATENCION REQUERIDA (Riesgo de perdida de ventas)</h4>
            <p className="text-xs font-bold text-rose-600 mt-1">
              {sinAtender > 0 && `• ${sinAtender} solicitud(es) sin atender +48h `}
              {vencidas > 0 && `• ${vencidas} solicitud(es) vencidas `}
            </p>
          </div>
          <button onClick={load} className="bg-rose-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-700 shrink-0">Actualizar</button>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl shadow-inner"><FileText size={24}/></div>
              Solicitudes de Cliente
            </h1>
            <p className="text-slate-500 mt-2 font-medium">SC-YYYY#### — Inicio del ciclo: SC → COT → VEN → PEC → ENINV</p>
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm shadow-sm">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Actualizar
            </button>
            <button onClick={() => setShowCreate(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md flex items-center gap-2 text-sm">
              <Plus size={16}/> Nueva Solicitud
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-amber-300 transition-all" onClick={() => setActiveTab('Activas')}>
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform"><FileText size={24}/></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Solicitudes Activas</p>
            <h2 className="text-4xl font-black text-slate-800">{totalActivas}</h2>
            <p className="text-xs font-bold text-amber-600 mt-2 flex items-center gap-1">
              <Clock size={12}/> {sinAtender > 0 ? `${sinAtender} sin atender +48h` : 'Todas atendidas'}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-emerald-300 transition-all" onClick={() => setActiveTab('Confirmadas')}>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform"><CheckCircle2 size={24}/></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Confirmadas (COT)</p>
            <h2 className="text-4xl font-black text-slate-800">{totalConfirmadas}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">{totalConfirmadas} generaron cotizacion</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-red-300 transition-all" onClick={() => setActiveTab('Canceladas')}>
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-500 mb-4 group-hover:scale-110 transition-transform"><X size={24}/></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Canceladas</p>
            <h2 className="text-4xl font-black text-slate-800">{solicitudes.filter(s => s.estado === 'CANCELADA').length}</h2>
            <p className="text-xs font-bold text-slate-400 mt-2">Fuera del pipeline</p>
          </div>
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden cursor-pointer">
            <div className="absolute right-0 top-0 opacity-10"><Activity size={120}/></div>
            <p className="text-xs font-black text-indigo-200 uppercase tracking-wider mb-1 relative z-10">Total Solicitudes</p>
            <h2 className="text-4xl font-black relative z-10">{solicitudes.length}</h2>
            <p className="text-xs font-bold text-emerald-300 mt-2 flex items-center gap-1 relative z-10">
              <TrendingUp size={12}/> {totalConfirmadas} convertidas a COT
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex gap-2">
              {(['Activas', 'Confirmadas', 'Canceladas'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab
                      ? tab === 'Activas' ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200'
                      : tab === 'Confirmadas' ? 'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200'
                      : 'bg-red-100 text-red-800 shadow-sm border border-red-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}>
                  {tab}
                  <span className="ml-1.5 text-xs opacity-70">({tab === 'Activas' ? totalActivas : tab === 'Confirmadas' ? totalConfirmadas : solicitudes.filter(s => s.estado === 'CANCELADA').length})</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-72 flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
                <Search className="text-slate-400 shrink-0 mr-2" size={16}/>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar SC, cliente, asesor..."
                  className="w-full bg-transparent border-none text-sm font-medium text-slate-700 outline-none"/>
                {search && <button onClick={() => setSearch('')}><X size={14} className="text-slate-400"/></button>}
              </div>
              <button onClick={load} className="bg-white border border-slate-300 p-2.5 rounded-xl text-slate-600 hover:bg-slate-50 shadow-sm">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">SC / Trazabilidad</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Asesor</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Vencimiento</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {loading ? (
                  <tr><td colSpan={8} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-indigo-400 mx-auto mb-2"/>
                    <p className="text-slate-400">Cargando solicitudes...</p>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-16 text-center text-slate-500 font-medium">
                    No hay registros en esta categoria.
                    {activeTab === 'Activas' && (
                      <div className="mt-3">
                        <button onClick={() => setShowCreate(true)}
                          className="inline-flex items-center gap-1 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-indigo-700">
                          <Plus size={12}/> Nueva Solicitud
                        </button>
                      </div>
                    )}
                  </td></tr>
                ) : filtered.map(sc => {
                  const isOverdue = sc.fecha_vencimiento && new Date(sc.fecha_vencimiento) < new Date();
                  return (
                    <tr key={sc.id} onClick={() => loadDetail(sc.id)}
                      className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selected?.id === sc.id ? 'bg-indigo-50/40' : ''}`}>
                      <td className="px-6 py-4">
                        <span className="font-black text-indigo-700">{sc.numero}</span>
                        {(sc.cotizaciones || []).length > 0 && (
                          <p className="text-[10px] font-bold text-amber-500 mt-0.5">COT vinculada</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-800">{sc.customer_name || '-'}</span>
                        {sc.customer_phone && <p className="text-[11px] text-slate-400">{sc.customer_phone}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <TipoBadge tipo={sc.tipo_solicitud || 'Cotizacion de Producto'}/>
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium text-sm">{sc.advisor_name || '-'}</td>
                      <td className="px-6 py-4 text-slate-500 font-medium text-xs">{fDate(sc.fecha_solicitud)}</td>
                      <td className="px-6 py-4">
                        <span className={`font-medium text-xs ${isOverdue ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                          {isOverdue && <AlertTriangle size={10} className="inline mr-1"/>}
                          {fDate(sc.fecha_vencimiento)}
                        </span>
                      </td>
                      <td className="px-6 py-4"><EstadoBadge estado={sc.estado}/></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={e => { e.stopPropagation(); loadDetail(sc.id); }}
                            className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">
                            <FileText size={12}/> Ver
                          </button>
                          <button className="text-slate-400 hover:text-slate-700 p-1"><MoreVertical size={15}/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="border-t border-slate-100 px-6 py-3 flex justify-between items-center bg-slate-50/50">
              <p className="text-xs font-bold text-slate-400">{filtered.length} de {solicitudes.length} solicitudes</p>
            </div>
          )}
        </div>
      </div>

      {/* ── DETAIL PANEL: Full width from sidebar ── */}
      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm" onClick={() => { setSelected(null); setEditMode(false); }}/>

          <div className="fixed top-0 bottom-0 right-0 z-40 bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
            style={{ left: '240px' }}>

            {/* Panel Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white flex-shrink-0">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="font-extrabold text-slate-900 text-xl">{selected.numero}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Solicitud de Cliente</p>
                </div>
                <EstadoBadge estado={selected.estado}/>
                <TipoBadge tipo={selected.tipo_solicitud || 'Cotizacion de Producto'}/>
              </div>
              <div className="flex items-center gap-2">
                {!editMode ? (
                  <button onClick={() => setEditMode(true)}
                    className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-1 hover:bg-slate-50">
                    <Edit2 size={12}/> Editar
                  </button>
                ) : (
                  <>
                    <button onClick={() => setEditMode(false)} className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
                    <button onClick={saveEdit} disabled={savingEdit}
                      className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-50">
                      {savingEdit ? <RefreshCw size={12} className="animate-spin"/> : <Save size={12}/>} Guardar
                    </button>
                  </>
                )}
                <button onClick={() => { setSelected(null); setEditMode(false); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X size={18}/></button>
              </div>
            </div>

            {/* Split pane */}
            <div className="flex-1 flex overflow-hidden min-h-0">

              {/* LEFT: Info 45% */}
              <div className="w-[45%] border-r border-slate-100 overflow-y-auto p-6 space-y-5">

                {/* Cliente */}
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-xs font-black text-slate-400 uppercase mb-3">Cliente</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 flex-shrink-0"><User size={15}/></div>
                      <div>
                        <p className="font-bold text-slate-900">{selected.customer_name}</p>
                        {selected.customer_id && (
                          <Link href="/dashboard/agenda" className="text-xs text-indigo-500 hover:underline flex items-center gap-0.5">
                            Ver perfil <ExternalLink size={9}/>
                          </Link>
                        )}
                      </div>
                    </div>
                    {selected.customer_phone && (
                      <a href={`tel:${selected.customer_phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 pl-1">
                        <Phone size={13} className="text-slate-400"/> {selected.customer_phone}
                      </a>
                    )}
                    {selected.customer_email && (
                      <a href={`mailto:${selected.customer_email}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 pl-1">
                        <Mail size={13} className="text-slate-400"/> {selected.customer_email}
                      </a>
                    )}
                    {selected.customer_address && (
                      <p className="flex items-start gap-2 text-sm text-slate-600 pl-1">
                        <MapPin size={13} className="text-slate-400 mt-0.5 flex-shrink-0"/> {selected.customer_address}
                      </p>
                    )}
                  </div>
                </div>

                {/* Editable fields */}
                {editMode ? (
                  <div className="space-y-3">
                    <p className="text-xs font-black text-slate-400 uppercase">Editar Solicitud</p>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Tipo de Solicitud</label>
                      <select value={editForm.tipo_solicitud} onChange={e => setEditForm((f: any) => ({ ...f, tipo_solicitud: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">
                        {TIPOS_SC.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Modalidad de Pago</label>
                      <select value={editForm.modalidad_pago} onChange={e => setEditForm((f: any) => ({ ...f, modalidad_pago: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">
                        {MODALIDADES_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Asesor</label>
                      <input type="text" value={editForm.advisor_name} onChange={e => setEditForm((f: any) => ({ ...f, advisor_name: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Fecha de Vencimiento</label>
                      <input type="date" value={editForm.fecha_vencimiento} onChange={e => setEditForm((f: any) => ({ ...f, fecha_vencimiento: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Notas</label>
                      <textarea value={editForm.notas} onChange={e => setEditForm((f: any) => ({ ...f, notas: e.target.value }))} rows={3}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none"/>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Asesor', value: selected.advisor_name || '-' },
                        { label: 'Modalidad Pago', value: selected.modalidad_pago || '-' },
                        { label: 'Fecha Solicitud', value: fDate(selected.fecha_solicitud) },
                        { label: 'Vencimiento', value: fDate(selected.fecha_vencimiento) },
                      ].map(item => (
                        <div key={item.label} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                          <p className="text-xs text-slate-400 mb-1">{item.label}</p>
                          <p className="font-bold text-sm text-slate-800">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Modalidad 60/40 breakdown */}
                    {selected.modalidad_pago && selected.modalidad_pago.includes('60/40') && (
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                        <p className="text-xs font-black text-indigo-700 uppercase mb-2">Modalidad 60/40</p>
                        <div className="flex gap-4">
                          <div className="flex-1 bg-white rounded-lg p-2 text-center">
                            <p className="text-xs text-slate-400">Anticipo</p>
                            <p className="font-black text-indigo-700">60%</p>
                          </div>
                          <div className="flex-1 bg-white rounded-lg p-2 text-center">
                            <p className="text-xs text-slate-400">Pendiente</p>
                            <p className="font-black text-slate-700">40%</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Productos */}
                    {(selected.productos || []).length > 0 && (
                      <div>
                        <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos Solicitados</p>
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-slate-400 uppercase font-black">
                              <tr>
                                <th className="px-3 py-2 text-left">Producto</th>
                                <th className="px-3 py-2 text-right">Qty</th>
                                <th className="px-3 py-2 text-right">Precio</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {selected.productos.map((p: any, i: number) => (
                                <tr key={i}>
                                  <td className="px-3 py-2 font-medium text-slate-700">{p.product_name}</td>
                                  <td className="px-3 py-2 text-right text-slate-600">{p.qty}</td>
                                  <td className="px-3 py-2 text-right font-bold text-indigo-700">{fCOP(p.unit_price_cop || 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Notas */}
                    {selected.notas && (
                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                        <p className="text-xs font-black text-amber-700 uppercase mb-1.5">Notas</p>
                        <p className="text-sm text-amber-900">{selected.notas}</p>
                      </div>
                    )}

                    {/* Cotizaciones vinculadas */}
                    {(selected.cotizaciones || []).length > 0 && (
                      <div>
                        <p className="text-xs font-black text-slate-400 uppercase mb-2">Cotizaciones Generadas</p>
                        {selected.cotizaciones.map((c: any) => (
                          <Link key={c.id} href="/dashboard/ventas/cotizacion"
                            className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl mb-2 hover:bg-amber-100 transition-colors">
                            <div>
                              <span className="font-bold text-amber-800">{c.numero}</span>
                              <p className="text-xs text-amber-600 mt-0.5">{ESTADOS_SC[c.estado]?.label || c.estado}</p>
                            </div>
                            <ChevronRight size={15} className="text-amber-500"/>
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Estado change (always visible) */}
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Cambiar Estado</p>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(ESTADOS_SC)
                      .filter(([k]) => k !== selected.estado)
                      .map(([k, v]) => (
                        <button key={k} onClick={() => changeEstado(k)} disabled={saving}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold border hover:opacity-80 transition-opacity disabled:opacity-40"
                          style={{ backgroundColor: v.bg, color: v.color, borderColor: v.border }}>
                          {v.label}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* RIGHT: Actions + Activity 55% */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">

                {/* Primary Actions */}
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-3">Acciones Principales</p>
                  <div className="space-y-2">
                    {(selected.estado === 'BORRADOR' || selected.estado === 'PENDIENTE_CONFIRMACION') && (
                      <button onClick={confirmarSC} disabled={confirming}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md disabled:opacity-50 transition-colors">
                        {confirming ? <RefreshCw size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
                        Confirmar Solicitud + Crear Cotizacion
                      </button>
                    )}
                    {(selected.cotizaciones || []).length > 0 && (
                      <Link href="/dashboard/ventas/cotizacion"
                        className="w-full bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-amber-100 transition-colors">
                        <ArrowRight size={14}/> Ver Cotizacion vinculada
                      </Link>
                    )}
                  </div>
                </div>

                {/* Contactar */}
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-3">Contactar al Cliente</p>
                  <div className="grid grid-cols-3 gap-2">
                    {selected.customer_phone && (
                      <a href={`https://wa.me/57${selected.customer_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                        className="flex flex-col items-center gap-1.5 py-3 bg-green-50 border border-green-200 text-green-700 rounded-xl font-bold text-xs hover:bg-green-100 transition-colors">
                        <MessageCircle size={18}/>
                        WhatsApp
                      </a>
                    )}
                    {selected.customer_phone && (
                      <a href={`tel:${selected.customer_phone}`}
                        className="flex flex-col items-center gap-1.5 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl font-bold text-xs hover:bg-blue-100 transition-colors">
                        <Phone size={18}/>
                        Llamar
                      </a>
                    )}
                    {selected.customer_email && (
                      <a href={`mailto:${selected.customer_email}?subject=Solicitud ${selected.numero}`}
                        className="flex flex-col items-center gap-1.5 py-3 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-100 transition-colors">
                        <Mail size={18}/>
                        Email
                      </a>
                    )}
                  </div>
                  {!selected.customer_phone && !selected.customer_email && (
                    <p className="text-xs text-slate-400 italic">No hay datos de contacto para este cliente.</p>
                  )}
                </div>

                {/* Activity Timeline */}
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-3">Historial de Actividad</p>
                  {(selected.actividades || []).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Sin actividad registrada.</p>
                  ) : (
                    <div className="space-y-4 relative before:absolute before:left-2 before:top-0 before:bottom-0 before:w-0.5 before:bg-slate-100">
                      {[...(selected.actividades || [])].reverse().map((a: any) => (
                        <div key={a.id} className="flex gap-4 pl-7 relative">
                          <ActionDot action={a.action}/>
                          <div className="flex-1 bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                            <p className="text-sm font-bold text-slate-700">{a.description}</p>
                            {a.old_estado && a.new_estado && (
                              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                <EstadoBadge estado={a.old_estado}/>
                                <ArrowRight size={10} className="text-slate-300"/>
                                <EstadoBadge estado={a.new_estado}/>
                              </p>
                            )}
                            <p className="text-xs text-slate-400 mt-1">
                              {fDate(a.created_at)} a las {fTime(a.created_at)}
                              {a.user_name && <span className="ml-2 font-medium">• {a.user_name}</span>}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── CREATE MODAL ── */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-white flex-shrink-0">
              <div>
                <h3 className="font-extrabold text-xl text-slate-900">Nueva Solicitud de Cliente</h3>
                <p className="text-xs text-slate-500 mt-0.5">El numero SC se asignara automaticamente</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X size={18}/></button>
            </div>

            <form onSubmit={createSolicitud} className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-5">

                {/* Cliente */}
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Cliente</label>
                  <div className="relative">
                    <input type="text" value={custSearch} onChange={e => onCustSearch(e.target.value)}
                      placeholder="Buscar por nombre, telefono, email..."
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"/>
                    {custResults.length > 0 && !selectedCust && (
                      <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                        {custResults.map((c: any) => (
                          <button key={c.id} type="button" onClick={() => {
                            setSelectedCust(c);
                            setCustSearch(`${c.first_name} ${c.last_name}`.trim());
                            setCustResults([]);
                          }} className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 text-sm border-b border-slate-50 last:border-0">
                            <span className="font-bold text-slate-800">{c.first_name} {c.last_name}</span>
                            <span className="ml-2 text-xs text-slate-400">{c.phone || c.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedCust && (
                    <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 flex items-center justify-between">
                      <span className="text-sm font-bold text-indigo-700">{selectedCust.first_name} {selectedCust.last_name}</span>
                      <button type="button" onClick={() => { setSelectedCust(null); setCustSearch(''); }}
                        className="text-indigo-400 hover:text-indigo-700"><X size={14}/></button>
                    </div>
                  )}
                </div>

                {/* Tipo + Modalidad */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Tipo de Solicitud</label>
                    <select value={form.tipo_solicitud} onChange={e => setForm(f => ({ ...f, tipo_solicitud: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">
                      {TIPOS_SC.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Modalidad de Pago</label>
                    <select value={form.modalidad_pago} onChange={e => setForm(f => ({ ...f, modalidad_pago: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">
                      {MODALIDADES_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                {form.modalidad_pago.includes('60/40') && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex gap-4">
                    <div className="flex-1 bg-white rounded-lg p-2 text-center">
                      <p className="text-xs text-slate-400">Anticipo</p>
                      <p className="font-black text-indigo-700 text-lg">60%</p>
                    </div>
                    <div className="flex-1 bg-white rounded-lg p-2 text-center">
                      <p className="text-xs text-slate-400">Saldo al entregar</p>
                      <p className="font-black text-slate-700 text-lg">40%</p>
                    </div>
                  </div>
                )}

                {/* Producto (solo si tipo = Cotizacion de Producto) */}
                {form.tipo_solicitud === 'Cotizacion de Producto' && (
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase mb-2 block">
                      Producto a Cotizar <span className="text-slate-300 font-medium">(opcional)</span>
                    </label>
                    <ProductSearch
                      value={prodName}
                      onChange={v => setProdName(v)}
                      onSelect={p => { setProdName(p.name || p.product_name); }}
                      onConfirmNew={name => { setProdName(name); }}
                    />
                    {prodName && (
                      <div className="mt-2 flex items-center gap-2">
                        <label className="text-xs text-slate-500">Cantidad:</label>
                        <input type="number" min="1" value={prodQty} onChange={e => setProdQty(Number(e.target.value))}
                          className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center font-bold outline-none focus:ring-1 focus:ring-indigo-200"/>
                        <button type="button" onClick={() => {
                          if (prodName) { setProductos(p => [...p, { product_name: prodName, qty: prodQty, unit_price_cop: 0 }]); setProdName(''); setProdQty(1); }
                        }} className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold hover:bg-indigo-200">
                          + Agregar
                        </button>
                      </div>
                    )}
                    {productos.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {productos.map((p, i) => (
                          <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5">
                            <span className="text-sm font-bold text-slate-700">{p.product_name} x{p.qty}</span>
                            <button type="button" onClick={() => setProductos(prev => prev.filter((_, idx) => idx !== i))}
                              className="text-red-400 hover:text-red-600"><X size={13}/></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-2">
                      Si el producto no esta en el catalogo, dejalo en blanco y detallalo en las Notas.
                    </p>
                  </div>
                )}

                {/* Asesor + Vencimiento */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Asesor</label>
                    <input type="text" value={form.advisor_name} onChange={e => setForm(f => ({ ...f, advisor_name: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"/>
                  </div>
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Dias Vencimiento</label>
                    <input type="number" min="1" max="365" value={form.dias_vencimiento} onChange={e => setForm(f => ({ ...f, dias_vencimiento: Number(e.target.value) }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"/>
                  </div>
                </div>

                {/* Notas */}
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase mb-2 block">
                    Notas / Observaciones
                    {form.tipo_solicitud === 'Cotizacion de Producto' && (
                      <span className="text-slate-400 font-medium ml-2">(si no especificaste producto, describe aqui)</span>
                    )}
                  </label>
                  <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={3}
                    placeholder={form.tipo_solicitud === 'Cotizacion de Producto' ? 'Ej: Cliente necesita zapatillas talla 42 color negro, modelo Air Max...' : 'Detalles de la solicitud...'}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none"/>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 flex-shrink-0">
                <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold text-sm hover:bg-slate-100">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md flex items-center gap-2 disabled:opacity-50">
                  {saving ? <RefreshCw size={14} className="animate-spin"/> : <Plus size={14}/>}
                  Crear Solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
