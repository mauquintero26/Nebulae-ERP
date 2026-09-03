"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Network, ArrowLeft, Plus, Save, Trash2, RefreshCw, CheckCircle2, AlertCircle, X, Zap, MessageCircle, Mail, Send, UserPlus, Tag, ToggleLeft, ToggleRight, Play, Pause, ChevronRight, ChevronDown, Edit2, Globe } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.statusText); }
  return r.json();
}

const CANALES_FLUJO = [
  { id: 'INSTAGRAM', label: 'Instagram', color: 'from-purple-500 to-pink-500', emoji: '📸' },
  { id: 'WHATSAPP', label: 'WhatsApp', color: 'from-emerald-500 to-green-600', emoji: '💬' },
  { id: 'FACEBOOK', label: 'Facebook', color: 'from-blue-600 to-indigo-600', emoji: '👥' },
  { id: 'TIKTOK', label: 'TikTok', color: 'from-black to-slate-700', emoji: '🎵' },
  { id: 'EMAIL', label: 'Email', color: 'from-amber-500 to-orange-500', emoji: '📧' },
  { id: 'FISICO', label: 'Físico', color: 'from-slate-500 to-slate-700', emoji: '🏪' },
];

const TIPOS_NODO = [
  { id: 'trigger', label: 'Disparador (Keyword)', icon: '⚡', color: 'bg-purple-100 border-purple-300 text-purple-700', desc: 'Activa el flujo cuando se detecta la palabra clave' },
  { id: 'send_dm', label: 'Enviar DM/Mensaje', icon: '💬', color: 'bg-blue-100 border-blue-300 text-blue-700', desc: 'Envía un mensaje directo al usuario' },
  { id: 'send_email', label: 'Enviar Email', icon: '📧', color: 'bg-amber-100 border-amber-300 text-amber-700', desc: 'Envía un correo al lead' },
  { id: 'create_lead', label: 'Crear Lead CRM', icon: '👤', color: 'bg-emerald-100 border-emerald-300 text-emerald-700', desc: 'Registra el usuario como lead en el CRM' },
  { id: 'apply_discount', label: 'Aplicar Descuento', icon: '🏷️', color: 'bg-rose-100 border-rose-300 text-rose-700', desc: 'Envía un código de descuento' },
  { id: 'tag_crm', label: 'Etiquetar en CRM', icon: '🔖', color: 'bg-indigo-100 border-indigo-300 text-indigo-700', desc: 'Agrega etiqueta al lead en el pipeline' },
  { id: 'notify_agent', label: 'Notificar Agente', icon: '🔔', color: 'bg-slate-100 border-slate-300 text-slate-700', desc: 'Envía alerta al equipo de ventas' },
  { id: 'condition', label: 'Condición', icon: '🔀', color: 'bg-orange-100 border-orange-300 text-orange-700', desc: 'Bifurca el flujo según condición' },
];

export default function FlujosPage() {
  const [flujos, setFlujos] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [selectedCanal, setSelectedCanal] = useState('INSTAGRAM');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNodeIdx, setSelectedNodeIdx] = useState<number | null>(null);
  const [toast, setToast] = useState<{msg:string;type:string}|null>(null);
  // Form para nuevo flujo
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFlujoName, setNewFlujoName] = useState('');
  const [newFlujoKeyword, setNewFlujoKeyword] = useState('');
  // Acciones del flujo seleccionado (array de nodos)
  const [acciones, setAcciones] = useState<any[]>([]);
  const showToast = (msg: string, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const loadFlujos = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`/marketing/flujos?canal=${selectedCanal}`);
      setFlujos(d.data || []);
    } catch { showToast('Error cargando flujos','error'); }
    setLoading(false);
  }, [selectedCanal]);
  
  useEffect(() => { loadFlujos(); }, [loadFlujos]);
  
  const selectFlujo = (f: any) => {
    setSelected(f);
    setAcciones(f.acciones || []);
    setSelectedNodeIdx(null);
  };
  
  const saveFlujo = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await apiFetch(`/marketing/flujos/${selected.id}`, { method:'PATCH', body:JSON.stringify({ acciones, nombre: selected.nombre, trigger_keyword: selected.trigger_keyword }) });
      showToast('Flujo guardado');
      loadFlujos();
    } catch(e:any) { showToast(e.message,'error'); }
    setSaving(false);
  };
  
  const toggleFlujo = async (f: any) => {
    try {
      const nuevoEstado = f.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
      await apiFetch(`/marketing/flujos/${f.id}`, { method:'PATCH', body:JSON.stringify({ estado: nuevoEstado }) });
      showToast(nuevoEstado === 'ACTIVO' ? 'Flujo activado' : 'Flujo desactivado');
      loadFlujos();
      if (selected?.id === f.id) setSelected((s:any) => ({...s, estado: nuevoEstado}));
    } catch(e:any) { showToast(e.message,'error'); }
  };
  
  const deleteFlujo = async (id: number) => {
    if (!confirm('¿Eliminar este flujo?')) return;
    try {
      await apiFetch(`/marketing/flujos/${id}`, {method:'DELETE'});
      showToast('Flujo eliminado');
      if (selected?.id === id) setSelected(null);
      loadFlujos();
    } catch(e:any) { showToast(e.message,'error'); }
  };
  
  const createFlujo = async () => {
    if (!newFlujoName) return;
    try {
      const d = await apiFetch('/marketing/flujos', { method:'POST', body:JSON.stringify({
        nombre: newFlujoName, canal: selectedCanal,
        trigger_keyword: newFlujoKeyword || 'INFO',
        estado: 'INACTIVO',
        acciones: [
          { id: 1, tipo: 'trigger', texto: `Usuario escribe "${newFlujoKeyword||'INFO'}"`, config: {} },
          { id: 2, tipo: 'send_dm', texto: 'Enviar DM con información del producto', config: { mensaje: 'Hola! 👋 Aquí tienes la información que pediste...' } },
          { id: 3, tipo: 'create_lead', texto: 'Crear Lead en CRM', config: { etiqueta: 'Lead Caliente' } },
        ],
      })});
      showToast(`Flujo "${d.data.nombre}" creado`);
      setShowNewForm(false); setNewFlujoName(''); setNewFlujoKeyword('');
      loadFlujos();
      selectFlujo(d.data);
    } catch(e:any) { showToast(e.message,'error'); }
  };
  
  const addNodo = (tipo: string) => {
    const tipoInfo = TIPOS_NODO.find(t => t.id === tipo);
    if (!tipoInfo) return;
    const newNode = { id: Date.now(), tipo, texto: tipoInfo.label, config: {} };
    setAcciones(a => [...a, newNode]);
  };
  
  const removeNodo = (idx: number) => {
    setAcciones(a => a.filter((_,i) => i !== idx));
    if (selectedNodeIdx === idx) setSelectedNodeIdx(null);
  };
  
  const updateNodoConfig = (idx: number, key: string, value: string) => {
    setAcciones(a => a.map((n,i) => i === idx ? {...n, config: {...n.config, [key]: value}} : n));
  };

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden">
      {toast && <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold flex items-center gap-2 ${toast.type==='ok'?'bg-blue-600':'bg-red-600'}`}>{toast.msg}</div>}
      
      {/* HEADER */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm">
        <div>
          <Link href="/dashboard/marketing" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mb-1"><ArrowLeft size={12}/> Marketing</Link>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Network className="text-blue-600" size={22}/> Flujos de Automatización</h1>
          <p className="text-xs text-slate-400 mt-0.5">Configura respuestas automáticas por palabra clave en cada canal social</p>
        </div>
        {selected && (
          <div className="flex gap-2">
            <button onClick={saveFlujo} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm disabled:opacity-50">
              <Save size={14}/>{saving?'Guardando...':'Guardar Flujo'}
            </button>
          </div>
        )}
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* COL 1: Selector de Canal + Lista Flujos */}
        <div className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col">
          {/* Canal Selector */}
          <div className="p-3 border-b border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Canal</p>
            <div className="space-y-1">
              {CANALES_FLUJO.map(c=>(
                <button key={c.id} onClick={()=>{setSelectedCanal(c.id);setSelected(null);}} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${selectedCanal===c.id?`bg-gradient-to-r ${c.color} text-white shadow-md`:'text-slate-600 hover:bg-slate-50'}`}>
                  <span className="text-base">{c.emoji}</span>{c.label}
                  {selectedCanal===c.id && <span className="ml-auto text-white/70 text-[10px]">{flujos.length}</span>}
                </button>
              ))}
            </div>
          </div>
          {/* Lista Flujos */}
          <div className="p-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase">Flujos ({flujos.length})</p>
            <button onClick={()=>setShowNewForm(!showNewForm)} className="text-blue-600 hover:text-blue-800"><Plus size={16}/></button>
          </div>
          {showNewForm && (
            <div className="p-3 border-b border-blue-100 bg-blue-50/50 space-y-2">
              <input value={newFlujoName} onChange={e=>setNewFlujoName(e.target.value)} placeholder="Nombre del flujo" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-200"/>
              <input value={newFlujoKeyword} onChange={e=>setNewFlujoKeyword(e.target.value.toUpperCase())} placeholder="Keyword: INFO, PRECIO, COMPRAR" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-200 font-mono"/>
              <div className="flex gap-1">
                <button onClick={createFlujo} className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700">Crear</button>
                <button onClick={()=>setShowNewForm(false)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs">×</button>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {loading && <p className="text-center py-8 text-slate-400 text-xs">Cargando...</p>}
            {!loading && flujos.length===0 && <div className="text-center py-8 text-slate-400 text-xs"><p>Sin flujos para {selectedCanal}</p><button onClick={()=>setShowNewForm(true)} className="mt-2 text-blue-600 font-bold">+ Crear primero</button></div>}
            {flujos.map(f=>(
              <div key={f.id} onClick={()=>selectFlujo(f)} className={`p-3 border-b border-slate-100 cursor-pointer hover:bg-blue-50/30 ${selected?.id===f.id?'bg-blue-50 border-l-2 border-l-blue-600':''}`}>
                <div className="flex items-start justify-between mb-1">
                  <p className="font-bold text-slate-800 text-xs leading-tight">{f.nombre}</p>
                  <button onClick={e=>{e.stopPropagation();toggleFlujo(f);}} className="shrink-0 ml-1">
                    {f.estado==='ACTIVO'?<ToggleRight size={18} className="text-emerald-500"/>:<ToggleLeft size={18} className="text-slate-300"/>}
                  </button>
                </div>
                <p className="text-[10px] font-mono text-blue-600">⚡ "{f.trigger_keyword}"</p>
                <p className="text-[9px] text-slate-400 mt-0.5">{(f.acciones||[]).length} acciones · {f.estado}</p>
              </div>
            ))}
          </div>
        </div>
        
        {/* COL 2: Canvas visual del flujo */}
        {selected ? (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
            <div className="w-full max-w-lg">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-black text-slate-800">{selected.nombre}</h2>
                  <p className="text-xs text-slate-400">Canal: {selected.canal} · Keyword: "{selected.trigger_keyword}"</p>
                </div>
                <button onClick={()=>deleteFlujo(selected.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-400"><Trash2 size={14}/></button>
              </div>
              {/* Nodos */}
              <div className="space-y-3">
                {acciones.map((nodo, idx) => {
                  const tipoInfo = TIPOS_NODO.find(t => t.id === nodo.tipo);
                  const isSelected = selectedNodeIdx === idx;
                  return (
                    <div key={nodo.id || idx}>
                      {/* Flecha conectora */}
                      {idx > 0 && <div className="flex justify-center my-1"><div className="w-0.5 h-6 bg-blue-200"/></div>}
                      {/* Nodo */}
                      <div onClick={()=>setSelectedNodeIdx(isSelected ? null : idx)} className={`relative border-2 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md ${tipoInfo?.color || 'bg-slate-100 border-slate-200 text-slate-700'} ${isSelected?'shadow-lg ring-2 ring-blue-400':''}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{tipoInfo?.icon || '⚙️'}</span>
                          <div className="flex-1">
                            <p className="font-black text-sm">{tipoInfo?.label || nodo.tipo}</p>
                            <p className="text-xs opacity-70 mt-0.5">{nodo.config?.mensaje || nodo.config?.etiqueta || tipoInfo?.desc || ''}</p>
                          </div>
                          <button onClick={e=>{e.stopPropagation();removeNodo(idx);}} className="p-1 hover:bg-black/10 rounded-lg opacity-60 hover:opacity-100"><X size={12}/></button>
                        </div>
                        {/* Config expandida */}
                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-black/10 space-y-2">
                            {nodo.tipo === 'send_dm' && (
                              <div><label className="text-xs font-bold opacity-70 block mb-1">Mensaje a enviar</label><textarea value={nodo.config?.mensaje||''} onChange={e=>updateNodoConfig(idx,'mensaje',e.target.value)} rows={3} className="w-full bg-white/60 border border-black/10 rounded-xl px-3 py-2 text-xs outline-none resize-none"/></div>
                            )}
                            {nodo.tipo === 'send_email' && (
                              <><div><label className="text-xs font-bold opacity-70 block mb-1">Asunto</label><input value={nodo.config?.asunto||''} onChange={e=>updateNodoConfig(idx,'asunto',e.target.value)} className="w-full bg-white/60 border border-black/10 rounded-xl px-3 py-2 text-xs outline-none"/></div>
                              <div><label className="text-xs font-bold opacity-70 block mb-1">Cuerpo</label><textarea value={nodo.config?.cuerpo||''} onChange={e=>updateNodoConfig(idx,'cuerpo',e.target.value)} rows={2} className="w-full bg-white/60 border border-black/10 rounded-xl px-3 py-2 text-xs outline-none resize-none"/></div></>
                            )}
                            {nodo.tipo === 'apply_discount' && (
                              <><div><label className="text-xs font-bold opacity-70 block mb-1">Código</label><input value={nodo.config?.codigo||''} onChange={e=>updateNodoConfig(idx,'codigo',e.target.value)} className="w-full bg-white/60 border border-black/10 rounded-xl px-3 py-2 text-xs outline-none font-mono"/></div>
                              <div><label className="text-xs font-bold opacity-70 block mb-1">Descuento %</label><input type="number" value={nodo.config?.pct||''} onChange={e=>updateNodoConfig(idx,'pct',e.target.value)} className="w-full bg-white/60 border border-black/10 rounded-xl px-3 py-2 text-xs outline-none"/></div></>
                            )}
                            {nodo.tipo === 'tag_crm' && (
                              <div><label className="text-xs font-bold opacity-70 block mb-1">Etiqueta CRM</label><input value={nodo.config?.etiqueta||''} onChange={e=>updateNodoConfig(idx,'etiqueta',e.target.value)} placeholder="Lead Caliente" className="w-full bg-white/60 border border-black/10 rounded-xl px-3 py-2 text-xs outline-none"/></div>
                            )}
                            {nodo.tipo === 'trigger' && (
                              <div><label className="text-xs font-bold opacity-70 block mb-1">Palabra clave</label><input value={nodo.config?.keyword || selected.trigger_keyword ||''} onChange={e=>updateNodoConfig(idx,'keyword',e.target.value)} className="w-full bg-white/60 border border-black/10 rounded-xl px-3 py-2 text-xs outline-none font-mono"/></div>
                            )}
                            {nodo.tipo === 'condition' && (
                              <div><label className="text-xs font-bold opacity-70 block mb-1">Condición</label><select value={nodo.config?.condicion||''} onChange={e=>updateNodoConfig(idx,'condicion',e.target.value)} className="w-full bg-white/60 border border-black/10 rounded-xl px-3 py-2 text-xs outline-none bg-transparent">
                                <option value="">Seleccionar...</option>
                                {['Es cliente existente','Es lead nuevo','Respondió en 24h','Tiene email','No tiene email'].map(o=><option key={o}>{o}</option>)}
                              </select></div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* Add Node Button */}
                <div className="flex justify-center mt-4">
                  <div className="flex justify-center"><div className="w-0.5 h-4 bg-blue-200"/></div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-400"><Network size={40} className="mx-auto mb-3 opacity-20"/><p className="font-bold text-sm">Selecciona un flujo</p><p className="text-xs mt-1">o crea uno nuevo con el + en la lista</p></div>
          </div>
        )}
        
        {/* COL 3: Panel de nodos disponibles */}
        {selected && (
          <div className="w-64 shrink-0 bg-white border-l border-slate-200 flex flex-col">
            <div className="p-4 border-b border-slate-100">
              <p className="text-xs font-black text-slate-400 uppercase mb-1">Agregar Acción</p>
              <p className="text-[10px] text-slate-400">Click para agregar al flujo</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {TIPOS_NODO.map(t=>(
                <button key={t.id} onClick={()=>addNodo(t.id)} className={`w-full flex items-start gap-2 p-3 rounded-xl border text-left hover:shadow-sm transition-all ${t.color}`}>
                  <span className="text-xl shrink-0">{t.icon}</span>
                  <div><p className="font-bold text-xs leading-tight">{t.label}</p><p className="text-[10px] opacity-60 mt-0.5 leading-tight">{t.desc}</p></div>
                </button>
              ))}
            </div>
            {/* Estado del flujo */}
            <div className="p-4 border-t border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Estado del Flujo</p>
              <button onClick={()=>toggleFlujo(selected)} className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-colors ${selected.estado==='ACTIVO'?'bg-emerald-600 text-white hover:bg-emerald-700':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {selected.estado==='ACTIVO'?<><ToggleRight size={16}/> Activo</>:<><ToggleLeft size={16}/> Inactivo</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
