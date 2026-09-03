"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowLeft, Plus, Save, Trash2, RefreshCw, CheckCircle2, AlertCircle, X, Image, Upload, Palette, CalendarClock, Share2, Camera, Monitor, Smartphone, Instagram, MessageCircle, Globe, Tag, DollarSign, Eye, Zap, Play } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.statusText); }
  return r.json();
}
const fCOP = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

const CANALES_POST = ['Instagram','WhatsApp','Facebook','TikTok','YouTube','Email','SMS'];
const FORMATOS_VISUALES = [
  { id:'minimalista', label:'Minimalista', desc:'Fondo blanco, tipografía limpia', bg:'bg-white', text:'text-slate-900' },
  { id:'bold', label:'Bold', desc:'Colores vibrantes y texto grande', bg:'bg-gradient-to-br from-purple-600 to-pink-600', text:'text-white' },
  { id:'elegante', label:'Elegante', desc:'Negro con dorado, premium', bg:'bg-gradient-to-br from-slate-900 to-slate-700', text:'text-amber-400' },
  { id:'festivo', label:'Festivo', desc:'Colores cálidos, celebración', bg:'bg-gradient-to-br from-orange-400 to-red-500', text:'text-white' },
  { id:'natural', label:'Natural', desc:'Tonos verdes, orgánico', bg:'bg-gradient-to-br from-emerald-400 to-teal-600', text:'text-white' },
];

export default function HistoriasPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{msg:string;type:string}|null>(null);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [generandoCaption, setGenerandoCaption] = useState(false);
  
  // Form para nueva publicación
  const [form, setForm] = useState({
    tipo: 'HISTORIA',
    producto_id: '' as string | number,
    producto_nombre: '',
    precio_cop: 0,
    descuento_pct: 0,
    canales: ['Instagram'] as string[],
    caption: '',
    imagen_url: '',
    formato: 'minimalista',
    programado_para: '',
    estado: 'BORRADOR',
  });
  
  const showToast = (msg: string, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };
  const setF = (k: string, v: any) => setForm(f => ({...f, [k]: v}));

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch('/marketing/posts?limit=100'); setPosts(d.data || []); } catch {}
    setLoading(false);
  }, []);
  
  const loadProductos = useCallback(async () => {
    try { const d = await apiFetch('/ecommerce/catalogo?limit=200&publicado=true'); setProductos(d.data || []); } catch {}
  }, []);
  
  useEffect(() => { loadPosts(); loadProductos(); }, [loadPosts, loadProductos]);
  
  const savePost = async () => {
    setSaving(true);
    try {
      const d = await apiFetch('/marketing/posts', { method:'POST', body:JSON.stringify({...form, precio_cop: Number(form.precio_cop), descuento_pct: Number(form.descuento_pct)}) });
      showToast('Publicación guardada');
      setForm({ tipo:'HISTORIA', producto_id:'', producto_nombre:'', precio_cop:0, descuento_pct:0, canales:['Instagram'], caption:'', imagen_url:'', formato:'minimalista', programado_para:'', estado:'BORRADOR' });
      loadPosts();
    } catch(e:any) { showToast(e.message,'error'); }
    setSaving(false);
  };
  
  const publishPost = async () => {
    setSaving(true);
    try {
      const d = await apiFetch('/marketing/posts', { method:'POST', body:JSON.stringify({...form, precio_cop:Number(form.precio_cop), descuento_pct:Number(form.descuento_pct), estado:'PUBLICADO'}) });
      showToast('Publicación lanzada! Aparece en catálogo de historias');
      setForm({ tipo:'HISTORIA', producto_id:'', producto_nombre:'', precio_cop:0, descuento_pct:0, canales:['Instagram'], caption:'', imagen_url:'', formato:'minimalista', programado_para:'', estado:'BORRADOR' });
      loadPosts();
    } catch(e:any) { showToast(e.message,'error'); }
    setSaving(false);
  };
  
  const deletePost = async (id: number) => {
    try { await apiFetch(`/marketing/posts/${id}`, {method:'DELETE'}); showToast('Eliminado'); loadPosts(); } catch(e:any) { showToast(e.message,'error'); }
  };
  
  const generateCaption = async () => {
    if (!form.producto_nombre) { showToast('Selecciona un producto primero','error'); return; }
    setGenerandoCaption(true);
    // Simulate AI caption generation with product context
    await new Promise(r => setTimeout(r, 1200));
    const captiones: Record<string, string> = {
      minimalista: `${form.producto_nombre}\n\nCalidad que habla por sí sola.\nPrecio: ${fCOP(form.precio_cop)}\n\n📦 Envío disponible | ✅ Stock disponible\nEscríbenos para más info 👇`,
      bold: `🔥 ¡NO TE LO PIERDAS!\n\n${form.producto_nombre.toUpperCase()}\n${form.descuento_pct>0?`💥 -${form.descuento_pct}% OFF`:''}\n💰 ${fCOP(form.precio_cop)}\n\n¡Solo por tiempo limitado! ⏰`,
      elegante: `${form.producto_nombre}\n\nElegancia redefinida.\nPrecio exclusivo: ${fCOP(form.precio_cop)}\n\n—\n✨ Premium · Exclusivo · Limitado`,
      festivo: `🎉 ¡OFERTA ESPECIAL!\n\n${form.producto_nombre} 🎊\nAhora a ${fCOP(form.precio_cop)}${form.descuento_pct>0?` (-${form.descuento_pct}%)`:''} \n\n🎁 Perfecto para regalar\n💬 Escríbenos: INFO`,
      natural: `🌿 ${form.producto_nombre}\n\nHecho con amor y calidad.\n${fCOP(form.precio_cop)} · Disponible ahora\n\n🌱 Sostenible · Natural · Para ti`,
    };
    setF('caption', captiones[form.formato] || captiones.minimalista);
    setGenerandoCaption(false);
  };
  
  const selectedFormato = FORMATOS_VISUALES.find(f => f.id === form.formato) || FORMATOS_VISUALES[0];
  const precioFinal = form.descuento_pct > 0 ? form.precio_cop * (1 - form.descuento_pct/100) : form.precio_cop;
  const filteredPosts = useMemo(() => posts.filter(p => !filtroTipo || p.tipo === filtroTipo), [posts, filtroTipo]);

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden">
      {toast && <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold flex items-center gap-2 ${toast.type==='ok'?'bg-purple-600':'bg-red-600'}`}>{toast.msg}</div>}
      
      {/* HEADER */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm">
        <div>
          <Link href="/dashboard/marketing" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mb-1"><ArrowLeft size={12}/> Marketing</Link>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Sparkles className="text-purple-600" size={22}/> Historias y Publicaciones</h1>
          <p className="text-xs text-slate-400 mt-0.5">Crea, diseña y programa contenido para tus redes sociales · Sincronización con inventario</p>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* PANEL IZQUIERDO: Formulario */}
        <div className="w-80 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
          <div className="p-4 space-y-4">
            <h3 className="font-black text-slate-700 text-sm">Nueva Publicación</h3>
            
            {/* Tipo */}
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase mb-1.5">Tipo</label>
              <div className="flex gap-1">
                {['HISTORIA','PUBLICACION','REEL'].map(t=>(
                  <button key={t} onClick={()=>setF('tipo',t)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${form.tipo===t?'bg-purple-600 text-white border-purple-600':'bg-white text-slate-500 border-slate-200 hover:border-purple-300'}`}>{t}</button>
                ))}
              </div>
            </div>
            
            {/* Producto */}
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase mb-1.5">Producto</label>
              <select value={String(form.producto_id)} onChange={e=>{
                const p = productos.find((x:any)=>String(x.id)===e.target.value);
                setForm(f=>({...f, producto_id: p?.id||'', producto_nombre: p?.nombre||'', precio_cop: p?.precio_venta||0}));
              }} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200 bg-white">
                <option value="">Seleccionar producto...</option>
                {productos.map((p:any)=>(<option key={p.id} value={String(p.id)}>{p.nombre} — {fCOP(p.precio_venta)}</option>))}
              </select>
            </div>
            
            {/* Precio y descuento */}
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-xs font-black text-slate-400 uppercase mb-1">Precio COP</label><input type="number" value={form.precio_cop} onChange={e=>setF('precio_cop',Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
              <div><label className="block text-xs font-black text-slate-400 uppercase mb-1">Descuento %</label><input type="number" min="0" max="100" value={form.descuento_pct} onChange={e=>setF('descuento_pct',Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            </div>
            
            {/* Formato visual */}
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase mb-1.5">Formato Visual</label>
              <div className="grid grid-cols-1 gap-1">
                {FORMATOS_VISUALES.map(f=>(
                  <button key={f.id} onClick={()=>setF('formato',f.id)} className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${form.formato===f.id?'border-purple-400 bg-purple-50':'border-slate-200 hover:border-purple-200'}`}>
                    <div className={`w-6 h-6 rounded-md ${f.bg} shrink-0 border border-black/10`}/>
                    <div><p className={`text-xs font-bold ${form.formato===f.id?'text-purple-700':'text-slate-700'}`}>{f.label}</p><p className="text-[10px] text-slate-400">{f.desc}</p></div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Caption */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black text-slate-400 uppercase">Caption</label>
                <button onClick={generateCaption} disabled={generandoCaption} className="flex items-center gap-1 text-[10px] px-2 py-1 bg-purple-50 text-purple-700 rounded-lg font-bold hover:bg-purple-100 disabled:opacity-50">
                  <Sparkles size={10}/>{generandoCaption?'Generando...':'IA Generate'}
                </button>
              </div>
              <textarea value={form.caption} onChange={e=>setF('caption',e.target.value)} rows={5} placeholder="Escribe el caption de tu historia..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200 resize-none"/>
            </div>
            
            {/* Imagen URL */}
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase mb-1.5">URL de Imagen</label>
              <input value={form.imagen_url} onChange={e=>setF('imagen_url',e.target.value)} placeholder="https://..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
            </div>
            
            {/* Canales */}
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase mb-1.5">Canales</label>
              <div className="flex flex-wrap gap-1">
                {CANALES_POST.map(c=>(
                  <button key={c} onClick={()=>setF('canales', form.canales.includes(c)?form.canales.filter(x=>x!==c):[...form.canales,c])} className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${form.canales.includes(c)?'bg-purple-600 text-white border-purple-600':'bg-white text-slate-500 border-slate-200'}`}>{c}</button>
                ))}
              </div>
            </div>
            
            {/* Fecha programación */}
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase mb-1.5">Programar Para</label>
              <input type="datetime-local" value={form.programado_para} onChange={e=>setF('programado_para',e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
            </div>
            
            {/* Botones */}
            <div className="space-y-2 pb-4">
              <button onClick={publishPost} disabled={saving} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                <Play size={14}/>{saving?'Publicando...':'Publicar Ahora'}
              </button>
              <button onClick={savePost} disabled={saving} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm disabled:opacity-50">
                Guardar como Borrador
              </button>
            </div>
          </div>
        </div>
        
        {/* PANEL CENTRAL: Preview del teléfono */}
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-100/50 overflow-y-auto py-8">
          <p className="text-xs font-black text-slate-400 uppercase mb-4">Vista Previa en Tiempo Real</p>
          {/* Phone mockup */}
          <div className="relative">
            {/* Phone frame */}
            <div className="w-72 h-[580px] bg-slate-900 rounded-[40px] p-3 shadow-2xl">
              <div className="w-full h-full rounded-[32px] overflow-hidden flex flex-col">
                {/* Status bar */}
                <div className="bg-slate-800 px-4 py-2 flex items-center justify-between shrink-0">
                  <span className="text-white text-[10px] font-bold">9:41</span>
                  <div className="w-16 h-4 bg-slate-900 rounded-full"/>
                  <div className="flex gap-1">{['','',''].map((_,i)=><div key={i} className="w-1 bg-white rounded-full" style={{height:`${6+i*2}px`}}/>)}</div>
                </div>
                {/* Story/Post Preview */}
                <div className={`flex-1 flex flex-col items-center justify-between p-4 ${selectedFormato.bg}`}>
                  {/* Top — canal + usuario */}
                  <div className="w-full flex items-center gap-2">
                    <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-black">N</span>
                    </div>
                    <div>
                      <p className={`text-xs font-black ${selectedFormato.text}`}>nebulae.kids</p>
                      <p className={`text-[9px] opacity-60 ${selectedFormato.text}`}>{form.tipo}</p>
                    </div>
                  </div>
                  {/* Middle — Imagen del producto */}
                  <div className="w-full flex-1 flex flex-col items-center justify-center my-3">
                    {form.imagen_url ? (
                      <img src={form.imagen_url} alt="Preview" className="w-full h-40 object-cover rounded-2xl shadow-lg"/>
                    ) : (
                      <div className="w-full h-40 bg-white/20 rounded-2xl flex items-center justify-center">
                        <div className="text-center">
                          <Image size={24} className={`mx-auto mb-1 opacity-40 ${selectedFormato.text}`}/>
                          <p className={`text-[10px] opacity-50 ${selectedFormato.text}`}>{form.producto_nombre || 'Producto'}</p>
                        </div>
                      </div>
                    )}
                    {/* Caption */}
                    {form.caption && (
                      <div className="w-full mt-3">
                        <p className={`text-[10px] leading-relaxed ${selectedFormato.text} opacity-90 line-clamp-4`}>{form.caption}</p>
                      </div>
                    )}
                  </div>
                  {/* Bottom — Precio */}
                  {form.producto_nombre && (
                    <div className="w-full">
                      <div className={`rounded-xl p-2.5 ${form.formato==='minimalista'?'bg-slate-100':'bg-white/20'}`}>
                        <p className={`text-[9px] font-black uppercase ${selectedFormato.text} opacity-70`}>{form.producto_nombre}</p>
                        <div className="flex items-baseline gap-2">
                          <p className={`text-sm font-black ${selectedFormato.text}`}>{fCOP(precioFinal)}</p>
                          {form.descuento_pct>0 && <>
                            <p className={`text-[9px] line-through opacity-50 ${selectedFormato.text}`}>{fCOP(form.precio_cop)}</p>
                            <span className="text-[9px] bg-red-500 text-white px-1.5 rounded-full font-black">-{form.descuento_pct}%</span>
                          </>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Formato label */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{selectedFormato.label}</span>
            </div>
          </div>
        </div>
        
        {/* PANEL DERECHO: Catálogo de publicaciones */}
        <div className="w-72 shrink-0 bg-white border-l border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-black text-slate-700 uppercase">Historial ({filteredPosts.length})</p>
              <button onClick={loadPosts}><RefreshCw size={13} className={loading?'animate-spin text-purple-600':'text-slate-400'}/></button>
            </div>
            <div className="flex gap-1">
              {['','HISTORIA','PUBLICACION','REEL'].map(t=>(
                <button key={t||'all'} onClick={()=>setFiltroTipo(t)} className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${filtroTipo===t?'bg-purple-600 text-white border-purple-600':'bg-white text-slate-500 border-slate-200'}`}>{t||'Todos'}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && <p className="text-center py-8 text-slate-400 text-xs">Cargando...</p>}
            {!loading && filteredPosts.length===0 && <p className="text-center py-8 text-slate-400 text-xs">Sin publicaciones aún</p>}
            {filteredPosts.map((p:any)=>(
              <div key={p.id} className="p-3 border-b border-slate-100 hover:bg-purple-50/30 group">
                <div className="flex gap-2">
                  {/* Miniatura */}
                  <div className="w-14 h-14 bg-slate-100 rounded-xl overflow-hidden shrink-0">
                    {p.imagen_url ? <img src={p.imagen_url} alt="" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center"><Image size={16} className="text-slate-300"/></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <p className="font-bold text-slate-800 text-xs leading-tight truncate">{p.producto_nombre || 'Post'}</p>
                      <button onClick={()=>deletePost(p.id)} className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500"><Trash2 size={11}/></button>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-0.5">{p.tipo}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${p.estado==='PUBLICADO'?'bg-emerald-100 text-emerald-700':p.estado==='PROGRAMADO'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500'}`}>{p.estado}</span>
                      {p.precio_cop>0 && <span className="text-[9px] text-purple-600 font-bold">{fCOP(p.precio_cop)}</span>}
                    </div>
                  </div>
                </div>
                {/* Canales chips */}
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {(p.canales||[]).map((c:string)=>(<span key={c} className="text-[8px] bg-slate-100 text-slate-500 px-1 rounded font-bold">{c}</span>))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
