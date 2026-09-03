"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ShoppingCart, TrendingUp, Users, AlertCircle, Package, Search, Filter,
  Globe, CreditCard, Truck, Settings, ArrowUpRight, Plus, Eye, MoreHorizontal,
  Edit2, Trash2, RefreshCw, X, Check, Image, Upload, Tag, AlertTriangle,
  Send, CheckCircle2, ShoppingBag, BarChart3, Layers, ToggleLeft, ToggleRight,
  MessageSquare, ExternalLink, Star, Activity, ChevronDown, ChevronUp, Grid, List
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || e.message || r.statusText); }
  return r.json();
}

const fCOP = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);
const fDate = (d: any) => d ? new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
const fDateTime = (d: any) => d ? new Date(d).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

const PWEB_ESTADOS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  PENDIENTE_DESPACHO: { label: 'Pendiente Despacho', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  DESPACHADO:        { label: 'Despachado',         bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  ENTREGADO:         { label: 'Entregado',           bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200' },
  CANCELADO:         { label: 'Cancelado',           bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
  EN_TRANSITO:       { label: 'En Tránsito',         bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

function Toast({ msg, type, onClose }: { msg: string; type: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3800); return () => clearTimeout(t); }, [onClose]);
  const bg = type === 'ok' ? 'bg-emerald-600' : 'bg-red-600';
  return (
    <div className={`fixed bottom-8 right-8 z-[100] flex items-center gap-3 ${bg} text-white px-5 py-3 rounded-2xl shadow-2xl`}>
      {type === 'ok' ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}
      <span className="font-semibold text-sm">{msg}</span>
      <button onClick={onClose}><X size={14}/></button>
    </div>
  );
}

/* =====================================================================
   MODAL PRODUCTO — Crear / Editar (Odoo-inspired, Nebulae design)
   ===================================================================== */
function ProductModal({ product, onSave, onClose, onToast }: { product: any; onSave: () => void; onClose: () => void; onToast: (m: string, t?: string) => void }) {
  const isNew = !product?.id;
  const [tab, setTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: product?.nombre || '',
    descripcion: product?.descripcion || '',
    descripcion_larga: product?.descripcion_larga || '',
    sku: product?.sku || '',
    tipo_producto: product?.tipo_producto || 'Bienes',
    precio_venta: product?.precio_venta || 0,
    precio_comparacion: product?.precio_comparacion || 0,
    descuento_pct: product?.descuento_pct || 0,
    impuesto_pct: product?.impuesto_pct || 0,
    categoria: product?.categoria || '',
    sub_categoria: product?.sub_categoria || '',
    marca: product?.marca || '',
    stock_disponible: product?.stock_disponible || 0,
    alerta_stock_minimo: product?.alerta_stock_minimo || 5,
    publicado_web: product?.publicado_web ?? false,
    rastrear_inventario: product?.rastrear_inventario ?? true,
    codigo_aduana: product?.codigo_aduana || '',
    peso_kg: product?.peso_kg || '',
    notas_internas: product?.notas_internas || '',
    seo_titulo: product?.seo_titulo || '',
    seo_descripcion: product?.seo_descripcion || '',
    seo_keywords: product?.seo_keywords || '',
    imagenes: product?.imagenes || [],
    atributos: product?.atributos || [],
    variantes: product?.variantes || [],
  });
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newAttrKey, setNewAttrKey] = useState('');
  const [newAttrVal, setNewAttrVal] = useState('');

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const addImage = () => { if (!newImageUrl.trim()) return; set('imagenes', [...form.imagenes, newImageUrl.trim()]); setNewImageUrl(''); };
  const removeImage = (i: number) => set('imagenes', form.imagenes.filter((_: any, idx: number) => idx !== i));
  const addAttr = () => { if (!newAttrKey.trim()) return; set('atributos', [...form.atributos, { nombre: newAttrKey, valor: newAttrVal }]); setNewAttrKey(''); setNewAttrVal(''); };
  const removeAttr = (i: number) => set('atributos', form.atributos.filter((_: any, idx: number) => idx !== i));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) { onToast('El nombre es requerido', 'error'); return; }
    setSaving(true);
    try {
      const endpoint = isNew ? '/ecommerce/catalogo' : `/ecommerce/catalogo/${product.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      await apiFetch(endpoint, { method, body: JSON.stringify(form) });
      onToast(isNew ? 'Producto creado exitosamente' : 'Producto actualizado', 'ok');
      onSave();
      onClose();
    } catch (e: any) { onToast(e.message, 'error'); }
    setSaving(false);
  };

  const TABS = [
    { k: 'general', l: 'Información General' },
    { k: 'precios', l: 'Ventas / Precios' },
    { k: 'inventario', l: 'Inventario' },
    { k: 'imagenes', l: 'Imágenes' },
    { k: 'atributos', l: 'Atributos y Variantes' },
    { k: 'seo', l: 'SEO' },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-4 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-purple-50 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="bg-purple-600 p-2 rounded-xl"><Package size={20} className="text-white"/></div>
              <div>
                <h2 className="text-lg font-black text-gray-900">{isNew ? 'Nuevo Producto' : form.nombre || 'Editar Producto'}</h2>
                <p className="text-xs text-gray-500">{isNew ? 'Agregar al catálogo digital' : `SKU: ${form.sku || '-'} · ${form.categoria || 'Sin categoría'}`}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-xl cursor-pointer">
                {form.publicado_web ? <ToggleRight size={18} className="text-emerald-600"/> : <ToggleLeft size={18} className="text-gray-400"/>}
                <span className={`text-xs font-bold ${form.publicado_web ? 'text-emerald-700' : 'text-gray-500'}`}>{form.publicado_web ? 'Publicado' : 'No publicado'}</span>
                <input type="checkbox" className="sr-only" checked={form.publicado_web} onChange={e => set('publicado_web', e.target.checked)}/>
              </label>
              <button onClick={onClose} className="p-2 hover:bg-purple-100 rounded-xl"><X size={18}/></button>
            </div>
          </div>
          {/* Breadcrumb toolbar (Odoo-style) */}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">
              {saving ? <RefreshCw size={13} className="animate-spin"/> : <Check size={13}/>} {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">Descartar</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-gray-100 bg-white shrink-0 overflow-x-auto">
          {TABS.map(({ k, l }) => (
            <button key={k} onClick={() => setTab(k)} className={`pb-2.5 px-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${tab === k ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{l}</button>
          ))}
        </div>

        {/* Body */}
        <form onSubmit={save} className="flex-1 overflow-y-auto p-6">
          {tab === 'general' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div className="col-span-2">
                  <label className="block text-xs font-black text-gray-500 uppercase mb-1">Nombre del Producto *</label>
                  <input required value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre completo del producto..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 font-medium"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase mb-1">Tipo de Producto</label>
                  <select value={form.tipo_producto} onChange={e => set('tipo_producto', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 bg-white">
                    {['Bienes','Servicio','Combinacion'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase mb-1">SKU / Código</label>
                  <input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="EJ: PROD-001" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase mb-1">Categoría</label>
                  <input value={form.categoria} onChange={e => set('categoria', e.target.value)} placeholder="Ej: Bienestar y Salud" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase mb-1">Sub-Categoría</label>
                  <input value={form.sub_categoria} onChange={e => set('sub_categoria', e.target.value)} placeholder="Ej: Cremas Hidratantes" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase mb-1">Marca / Brand</label>
                  <input value={form.marca} onChange={e => set('marca', e.target.value)} placeholder="Ej: EOS, Neutrogena..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-black text-gray-500 uppercase mb-1">Descripción Corta</label>
                  <input value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Descripción breve para catálogo..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-black text-gray-500 uppercase mb-1">Descripción Larga</label>
                  <textarea value={form.descripcion_larga} onChange={e => set('descripcion_larga', e.target.value)} rows={4} placeholder="Descripción detallada del producto para la página de producto..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 resize-none"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-black text-gray-500 uppercase mb-1">Notas Internas</label>
                  <textarea value={form.notas_internas} onChange={e => set('notas_internas', e.target.value)} rows={2} placeholder="Notas internas (solo visible en el ERP)..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 resize-none"/>
                </div>
              </div>
            </div>
          )}

          {tab === 'precios' && (
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Precio de Venta (COP)</label>
                <input type="number" min={0} value={form.precio_venta} onChange={e => set('precio_venta', Number(e.target.value))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Precio Comparación (antes de descuento)</label>
                <input type="number" min={0} value={form.precio_comparacion} onChange={e => set('precio_comparacion', Number(e.target.value))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Descuento %</label>
                <input type="number" min={0} max={100} value={form.descuento_pct} onChange={e => set('descuento_pct', Number(e.target.value))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Impuesto de Ventas %</label>
                <input type="number" min={0} max={100} value={form.impuesto_pct} onChange={e => set('impuesto_pct', Number(e.target.value))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Código Aduana</label>
                <input value={form.codigo_aduana} onChange={e => set('codigo_aduana', e.target.value)} placeholder="HS Code" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Peso (kg)</label>
                <input type="number" min={0} step="0.01" value={form.peso_kg} onChange={e => set('peso_kg', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
              </div>
              {/* Price summary */}
              <div className="col-span-2 bg-purple-50 border border-purple-100 rounded-2xl p-4">
                <p className="text-xs font-black text-purple-700 uppercase mb-2">Resumen de Precio</p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><p className="text-gray-400 text-xs">Precio base</p><p className="font-black text-gray-900">{fCOP(form.precio_venta)}</p></div>
                  <div><p className="text-gray-400 text-xs">Descuento ({form.descuento_pct}%)</p><p className="font-bold text-red-600">-{fCOP(form.precio_venta * form.descuento_pct / 100)}</p></div>
                  <div><p className="text-gray-400 text-xs">Precio Final</p><p className="font-black text-emerald-700 text-base">{fCOP(form.precio_venta * (1 - form.descuento_pct / 100))}</p></div>
                </div>
              </div>
            </div>
          )}

          {tab === 'inventario' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase mb-1">Stock Disponible</label>
                  <input type="number" min={0} value={form.stock_disponible} onChange={e => set('stock_disponible', Number(e.target.value))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase mb-1">Alerta de Stock Mínimo</label>
                  <input type="number" min={0} value={form.alerta_stock_minimo} onChange={e => set('alerta_stock_minimo', Number(e.target.value))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer p-4 bg-gray-50 rounded-2xl border border-gray-200 hover:bg-purple-50">
                <input type="checkbox" checked={form.rastrear_inventario} onChange={e => set('rastrear_inventario', e.target.checked)} className="rounded border-gray-300 text-purple-600"/>
                <div>
                  <p className="font-bold text-gray-900 text-sm">Rastrear Inventario</p>
                  <p className="text-xs text-gray-500">El sistema llevará control de stock en tiempo real</p>
                </div>
              </label>
              {form.stock_disponible <= form.alerta_stock_minimo && form.stock_disponible >= 0 && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0"/>
                  <div>
                    <p className="font-bold text-amber-900 text-sm">Alerta de Stock Bajo</p>
                    <p className="text-xs text-amber-700">El stock actual ({form.stock_disponible}) está en o por debajo del mínimo ({form.alerta_stock_minimo})</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'imagenes' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">Agrega URLs de imágenes para este producto. La primera imagen será la principal.</p>
              <div className="flex gap-2">
                <input value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addImage())} placeholder="https://ejemplo.com/imagen.jpg" className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                <button type="button" onClick={addImage} className="px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold flex items-center gap-2"><Plus size={14}/> Agregar</button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {form.imagenes.map((url: string, i: number) => (
                  <div key={i} className="relative group rounded-2xl overflow-hidden border border-gray-200 aspect-square bg-gray-50">
                    <img src={url} alt="" className="w-full h-full object-cover"/>
                    {i === 0 && <span className="absolute top-2 left-2 bg-purple-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">PRINCIPAL</span>}
                    <button type="button" onClick={() => removeImage(i)} className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>
                  </div>
                ))}
                {form.imagenes.length === 0 && (
                  <div className="col-span-3 text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
                    <Image size={32} className="mx-auto mb-2 opacity-30"/>
                    <p className="text-sm">Sin imágenes. Agrega URLs de imágenes arriba.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'atributos' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input value={newAttrKey} onChange={e => setNewAttrKey(e.target.value)} placeholder="Atributo (ej: Color)" className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                <input value={newAttrVal} onChange={e => setNewAttrVal(e.target.value)} placeholder="Valor (ej: Rojo, 250ml...)" className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                <button type="button" onClick={addAttr} className="px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold"><Plus size={14}/></button>
              </div>
              <div className="space-y-2">
                {form.atributos.map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <Tag size={14} className="text-purple-600 shrink-0"/>
                    <span className="font-bold text-xs text-gray-600 uppercase">{a.nombre}</span>
                    <span className="text-gray-400">:</span>
                    <span className="font-medium text-sm text-gray-800">{a.valor}</span>
                    <button type="button" onClick={() => removeAttr(i)} className="ml-auto p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"><X size={12}/></button>
                  </div>
                ))}
                {form.atributos.length === 0 && <p className="text-center text-gray-400 text-sm py-6">Sin atributos definidos</p>}
              </div>
            </div>
          )}

          {tab === 'seo' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Título SEO</label>
                <input value={form.seo_titulo} onChange={e => set('seo_titulo', e.target.value)} placeholder="Título para motores de búsqueda..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                <p className="text-[10px] text-gray-400 mt-1">{(form.seo_titulo || '').length}/70 caracteres recomendados</p>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Meta Descripción</label>
                <textarea value={form.seo_descripcion} onChange={e => set('seo_descripcion', e.target.value)} rows={3} placeholder="Descripción para resultados de búsqueda..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 resize-none"/>
                <p className="text-[10px] text-gray-400 mt-1">{(form.seo_descripcion || '').length}/160 caracteres recomendados</p>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Keywords</label>
                <input value={form.seo_keywords} onChange={e => set('seo_keywords', e.target.value)} placeholder="palabra1, palabra2, palabra3..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
              </div>
              {/* Preview */}
              <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                <p className="text-xs font-black text-gray-400 uppercase mb-2">Preview en Google</p>
                <p className="text-blue-700 font-medium text-sm">{form.seo_titulo || form.nombre || 'Título del producto'} | Nebulae</p>
                <p className="text-green-700 text-xs">nebulaekids.com/store/producto/{(form.nombre || 'producto').toLowerCase().replace(/ /g, '-')}</p>
                <p className="text-gray-600 text-xs mt-1">{form.seo_descripcion || form.descripcion || 'Descripción del producto...'}</p>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
/* =====================================================================
   MAIN PAGE â€” EcommercePage
   ===================================================================== */
export default function EcommercePage() {
  const [activeTab, setActiveTab] = useState('Panel');
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const showToast = (msg: string, type = 'ok') => setToast({ msg, type });

  const [stats, setStats] = useState<any>({});
  const [statsLoading, setStatsLoading] = useState(true);
  const [webOrders, setWebOrders] = useState<any[]>([]);
  const [ordersLoading, setOLoading] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderEstado, setOrderEstado] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [catalogo, setCatalogo] = useState<any[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [catCategoria, setCatCategoria] = useState('');
  const [catViewMode, setCatViewMode] = useState<'tabla'|'kanban'>('tabla');
  const [editProduct, setEditProduct] = useState<any>(null);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [menuProdId, setMenuProdId] = useState<number|null>(null);
  const [carritos, setCarritos] = useState<any[]>([]);
  const [payConfig, setPayConfig] = useState<any>({ stripe: { enabled: false, publishable_key: '' }, mercadopago: { enabled: false, public_key: '' } });
  const [shipConfig, setShipConfig] = useState<any>({ envio_local: { enabled: true, tarifa: 12000 }, envio_nacional: { enabled: true, tarifa: 25000 }, envio_gratis_desde: 200000 });
  const [savingPay, setSavingPay] = useState(false);
  const [savingShip, setSavingShip] = useState(false);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try { const d = await apiFetch('/ecommerce/stats'); setStats(d.data || {}); } catch {}
    setStatsLoading(false);
  }, []);

  const loadWebOrders = useCallback(async () => {
    setOLoading(true);
    try {
      let url = '/ecommerce/pedidos?limit=100';
      if (orderSearch) url += `&search=${encodeURIComponent(orderSearch)}`;
      if (orderEstado) url += `&estado=${orderEstado}`;
      const d = await apiFetch(url);
      setWebOrders(Array.isArray(d) ? d : (d.data || []));
    } catch {}
    setOLoading(false);
  }, [orderSearch, orderEstado]);

  const loadCatalogo = useCallback(async () => {
    setCatLoading(true);
    try {
      let url = '/ecommerce/catalogo?limit=200';
      if (catSearch) url += `&search=${encodeURIComponent(catSearch)}`;
      if (catCategoria) url += `&categoria=${encodeURIComponent(catCategoria)}`;
      const d = await apiFetch(url);
      setCatalogo(Array.isArray(d) ? d : (d.data || []));
    } catch {}
    setCatLoading(false);
  }, [catSearch, catCategoria]);

  const loadCarritos = useCallback(async () => {
    try { const d = await apiFetch('/ecommerce/carritos?estado=ABANDONADO'); setCarritos(d.data || []); } catch {}
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { if (activeTab === 'Panel') { loadWebOrders(); loadCarritos(); } }, [activeTab, loadWebOrders, loadCarritos]);
  useEffect(() => { if (activeTab === 'CatÃ¡logo') loadCatalogo(); }, [activeTab, loadCatalogo]);
  useEffect(() => {
    if (activeTab === 'Pagos') {
      apiFetch('/ecommerce/pagos/config').then(d => setPayConfig(d.data || payConfig)).catch(() => {});
      apiFetch('/ecommerce/envios/config').then(d => setShipConfig(d.data || shipConfig)).catch(() => {});
    }
  }, [activeTab]);

  const togglePublicado = async (prod: any) => {
    try {
      await apiFetch(`/ecommerce/catalogo/${prod.id}`, { method: 'PATCH', body: JSON.stringify({ publicado_web: !prod.publicado_web }) });
      showToast(prod.publicado_web ? 'Producto ocultado' : 'Producto publicado en tienda', 'ok');
      loadCatalogo();
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  const deleteProduct = async (id: number) => {
    if (!confirm('Â¿Eliminar este producto?')) return;
    try { await apiFetch(`/ecommerce/catalogo/${id}`, { method: 'DELETE' }); showToast('Producto eliminado', 'ok'); loadCatalogo(); } catch (e: any) { showToast(e.message, 'error'); }
    setMenuProdId(null);
  };

  const recuperarCarrito = async (cartId: number, descuento = 10) => {
    try { await apiFetch(`/ecommerce/carritos/${cartId}/recuperar`, { method: 'PATCH', body: JSON.stringify({ descuento_pct: descuento }) }); showToast(`RecuperaciÃ³n enviada con ${descuento}% descuento`, 'ok'); loadCarritos(); } catch (e: any) { showToast(e.message, 'error'); }
  };

  const catPublicados = catalogo.filter(p => p.publicado_web).length;
  const catBajoStock = catalogo.filter(p => p.is_low_stock && p.publicado_web).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {(showNewProduct || editProduct) && (
        <ProductModal product={editProduct || null} onSave={loadCatalogo} onClose={() => { setShowNewProduct(false); setEditProduct(null); }} onToast={showToast} />
      )}

      <div className="flex-1 flex flex-col px-6 py-6 gap-6 max-w-[1600px] mx-auto w-full">
        {/* HEADER */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-purple-600 text-white p-3 rounded-2xl shadow-lg"><ShoppingCart size={26}/></div>
            <div>
              <h1 className="text-3xl font-black text-gray-900">E-Commerce Center</h1>
              <p className="text-sm text-gray-400 mt-0.5">GestiÃ³n de ventas web Â· PWEB-YYYY#### Â· CatÃ¡logo Digital</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={loadStats} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm shadow-sm">
              <RefreshCw size={14} className={statsLoading ? 'animate-spin' : ''}/> Actualizar
            </button>
            <Link href="/store" target="_blank" className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm shadow-sm">
              <Globe size={14}/> Ver Tienda
            </Link>
            {activeTab === 'CatÃ¡logo' && (
              <button onClick={() => setShowNewProduct(true)} className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm shadow-sm">
                <Plus size={15}/> Nuevo Producto
              </button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { l: 'Ventas Hoy', v: fCOP(stats.revenue_today||0), s: `${stats.web_orders_today||0} pedidos web`, ic: <TrendingUp size={22}/>, ibg: 'bg-purple-100', it: 'text-purple-700', ok: true },
            { l: 'Ventas del Mes', v: fCOP(stats.revenue_month||0), s: `${stats.web_orders_month||0} pedidos PWEB`, ic: <BarChart3 size={22}/>, ibg: 'bg-indigo-100', it: 'text-indigo-700', ok: true },
            { l: 'Carritos Abandonados', v: String(stats.carritos_abandonados_count||0), s: fCOP(stats.carritos_abandonados_valor||0)+' en fuga', ic: <AlertCircle size={22}/>, ibg: 'bg-rose-100', it: 'text-rose-700', ok: (stats.carritos_abandonados_count||0)===0 },
            { l: 'Productos Publicados', v: String(stats.productos_publicados||catPublicados||0), s: catBajoStock>0?`${catBajoStock} con stock bajo`:'Inventario OK', ic: <Package size={22}/>, ibg: 'bg-emerald-100', it: 'text-emerald-700', ok: catBajoStock===0 },
          ].map((k,i) => (
            <div key={i} className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all p-5 ${k.ok?'border-gray-200':'border-red-200'}`}>
              <div className={`inline-flex p-2.5 rounded-xl mb-3 ${k.ibg} ${k.it}`}>{k.ic}</div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-1">{k.l}</p>
              <p className="text-2xl font-black text-gray-900 mb-1">{statsLoading?'...':k.v}</p>
              <p className={`text-xs font-semibold flex items-center gap-1 ${k.ok?'text-emerald-600':'text-rose-500'}`}>
                {k.ok?<CheckCircle2 size={11}/>:<AlertCircle size={11}/>}{k.s}
              </p>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
            {['Panel', 'Catálogo', 'Clientes Web', 'Pagos'].map(t => (
              <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === t ? 'bg-purple-600 text-white shadow' : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'}`}>{t}</button>
            ))}
          </div>
          {activeTab === 'Catálogo' && (
            <div className="flex items-center bg-gray-100 rounded-xl p-1">
              <button onClick={() => setCatViewMode('tabla')} className={`p-2 rounded-lg ${catViewMode === 'tabla' ? 'bg-white shadow text-purple-700' : 'text-gray-500'}`}><List size={16}/></button>
              <button onClick={() => setCatViewMode('kanban')} className={`p-2 rounded-lg ${catViewMode === 'kanban' ? 'bg-white shadow text-purple-700' : 'text-gray-500'}`}><Grid size={16}/></button>
            </div>
          )}
        </div>

        {/* PANEL */}
        {activeTab === 'Panel' && (
          <div className="flex gap-6 flex-1 min-h-0">
            <div className="w-80 shrink-0 bg-white rounded-3xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-rose-50/50 flex items-center justify-between">
                <h3 className="font-black text-gray-800 text-sm flex items-center gap-2"><AlertCircle className="text-rose-500" size={16}/> RecuperaciÃ³n de Carritos</h3>
                <span className="bg-rose-100 text-rose-700 text-xs font-black px-2 py-0.5 rounded-full">{carritos.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {carritos.length === 0 && <div className="text-center py-10 text-gray-400"><ShoppingCart size={28} className="mx-auto mb-2 opacity-30"/><p className="text-sm">Sin carritos abandonados</p></div>}
                {carritos.map((c: any) => (
                  <div key={c.id} className="border border-gray-100 p-4 rounded-2xl hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-gray-800 text-xs truncate">{c.customer_email||'AnÃ³nimo'}</p>
                      <span className="text-xs font-black text-gray-700 shrink-0">{fCOP(c.total_cop)}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mb-2">{fDateTime(c.created_at)} Â· {(c.productos||[]).length} productos</p>
                    {c.recuperacion_enviada ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-bold flex items-center gap-1"><Check size={10}/> RecuperaciÃ³n enviada ({c.recuperacion_descuento}% dto)</span>
                    ) : (
                      <div className="flex gap-1.5">
                        <button onClick={() => recuperarCarrito(c.id,10)} className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold py-1.5 rounded-lg border border-rose-100">Enviar 10% Dto</button>
                        <button onClick={() => recuperarCarrito(c.id,15)} className="flex-1 bg-orange-50 hover:bg-orange-100 text-orange-600 text-[10px] font-bold py-1.5 rounded-lg border border-orange-100">15% Dto</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3 flex-wrap">
                <h3 className="font-black text-gray-800 text-sm flex items-center gap-2"><ShoppingBag size={16} className="text-purple-600"/> Pedidos Web (PWEB)</h3>
                <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 gap-2 flex-1 max-w-xs">
                  <Search size={13} className="text-gray-400"/>
                  <input value={orderSearch} onChange={e => setOrderSearch(e.target.value)} onKeyDown={e => e.key==='Enter'&&loadWebOrders()} placeholder="Buscar PWEB, cliente..." className="text-xs bg-transparent outline-none flex-1"/>
                </div>
                <select value={orderEstado} onChange={e => setOrderEstado(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white outline-none">
                  <option value="">Todos los estados</option>
                  {Object.entries(PWEB_ESTADOS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <button onClick={loadWebOrders} className="p-2 bg-purple-50 border border-purple-200 rounded-xl text-purple-600"><RefreshCw size={14} className={ordersLoading?'animate-spin':''}/></button>
                <span className="text-xs text-gray-400 font-medium ml-auto">{webOrders.length} pedidos</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {ordersLoading ? <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"/></div> : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>{['#PWEB','Cliente','Total','Items','Estado','Fecha',''].map(h => <th key={h} className="px-5 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {webOrders.length===0&&<tr><td colSpan={7} className="text-center py-16 text-gray-400"><Globe size={32} className="mx-auto mb-3 opacity-30"/><p>Sin pedidos web</p><p className="text-xs mt-1">Los pedidos PWEB-YYYY#### aparecerÃ¡n aquÃ­</p></td></tr>}
                      {webOrders.map((o: any) => {
                        const est = PWEB_ESTADOS[o.estado]||{label:o.estado,bg:'bg-gray-50',text:'text-gray-600',border:'border-gray-200'};
                        return (
                          <tr key={o.id} className="hover:bg-purple-50/30 cursor-pointer transition-colors" onClick={() => setSelectedOrder(o)}>
                            <td className="px-5 py-3.5"><span className="font-black text-purple-700 text-sm">{o.numero}</span><br/><span className="text-[10px] text-gray-400">{o.pven_numero}</span></td>
                            <td className="px-5 py-3.5"><p className="font-bold text-gray-900">{o.customer_name}</p><p className="text-[10px] text-gray-400">{o.customer_email}</p></td>
                            <td className="px-5 py-3.5 font-black text-gray-900">{fCOP(o.total_cop)}</td>
                            <td className="px-5 py-3.5 text-xs text-gray-500">{(o.productos||[]).length}</td>
                            <td className="px-5 py-3.5"><span className={`px-2.5 py-1 rounded-full text-xs font-black border ${est.bg} ${est.text} ${est.border}`}>{est.label}</span></td>
                            <td className="px-5 py-3.5 text-xs text-gray-400">{fDate(o.created_at)}</td>
                            <td className="px-5 py-3.5"><button className="p-1.5 rounded-lg bg-purple-50 text-purple-600" onClick={e=>{e.stopPropagation();setSelectedOrder(o);}}><Eye size={13}/></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CATALOGO */}
        {activeTab === 'CatÃ¡logo' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm gap-2 flex-1 max-w-[400px]">
                <Search size={15} className="text-gray-400 shrink-0"/>
                <input value={catSearch} onChange={e => setCatSearch(e.target.value)} onKeyDown={e => e.key==='Enter'&&loadCatalogo()} placeholder="Buscar producto, SKU..." className="text-sm outline-none flex-1 bg-transparent"/>
                {catSearch && <button onClick={() => {setCatSearch('');loadCatalogo();}}><X size={13} className="text-gray-400"/></button>}
              </div>
              <input value={catCategoria} onChange={e => setCatCategoria(e.target.value)} onKeyDown={e => e.key==='Enter'&&loadCatalogo()} placeholder="Filtrar categorÃ­a..." className="border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-sm outline-none max-w-[200px] shadow-sm"/>
              <button onClick={loadCatalogo} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 shadow-sm"><RefreshCw size={14} className={catLoading?'animate-spin':''}/> Recargar</button>
              <span className="text-sm text-gray-400 font-medium">{catalogo.length} productos Â· {catPublicados} publicados</span>
            </div>

            {catLoading ? <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"/></div> : catViewMode==='tabla' ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>{['Producto','SKU','CategorÃ­a','Stock','Precio','Tienda','Acciones'].map(h => <th key={h} className="px-5 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {catalogo.length===0&&<tr><td colSpan={7} className="text-center py-16 text-gray-400"><Package size={32} className="mx-auto mb-3 opacity-30"/><p>Sin productos</p><button onClick={() => setShowNewProduct(true)} className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold">+ Nuevo Producto</button></td></tr>}
                    {catalogo.map((p: any) => (
                      <tr key={p.id} className="hover:bg-purple-50/30 cursor-pointer group transition-colors" onClick={() => setEditProduct(p)}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {p.imagenes?.[0] ? <img src={p.imagenes[0]} alt="" className="w-10 h-10 rounded-xl object-cover border border-gray-100 shrink-0"/> : <div className="w-10 h-10 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center shrink-0"><Package size={16} className="text-gray-400"/></div>}
                            <div><p className="font-bold text-gray-900">{p.nombre}</p>{p.marca&&<p className="text-[10px] text-gray-400">{p.marca}</p>}</div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-500 font-mono">{p.sku||'-'}</td>
                        <td className="px-5 py-3.5 text-xs text-gray-500">{p.categoria||'-'}</td>
                        <td className="px-5 py-3.5"><span className={`font-bold text-sm ${p.stock_disponible===0?'text-red-600':p.is_low_stock?'text-amber-600':'text-emerald-600'}`}>{p.stock_disponible} uds</span>{p.is_low_stock&&p.stock_disponible>0&&<AlertTriangle size={12} className="inline ml-1 text-amber-500"/>}</td>
                        <td className="px-5 py-3.5 font-black text-gray-900">{fCOP(p.precio_venta)}{p.descuento_pct>0&&<span className="ml-1 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-black">-{p.descuento_pct}%</span>}</td>
                        <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-center">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" className="sr-only peer" checked={p.publicado_web||false} onChange={() => togglePublicado(p)}/>
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                            </label>
                          </div>
                        </td>
                        <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                            <button onClick={() => setEditProduct(p)} className="p-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100"><Edit2 size={13}/></button>
                            <div className="relative">
                              <button onClick={() => setMenuProdId(menuProdId===p.id?null:p.id)} className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"><MoreHorizontal size={13}/></button>
                              {menuProdId===p.id&&(
                                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 w-44 z-20">
                                  <button onClick={() => {setEditProduct(p);setMenuProdId(null);}} className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm flex items-center gap-2"><Edit2 size={13}/> Editar</button>
                                  <button onClick={() => togglePublicado(p)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm flex items-center gap-2">{p.publicado_web?<><ToggleLeft size={13}/> Ocultar</>:<><ToggleRight size={13} className="text-emerald-600"/> Publicar</>}</button>
                                  <div className="border-t border-gray-100 my-1"/>
                                  <button onClick={() => deleteProduct(p.id)} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2"><Trash2 size={13}/> Eliminar</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400 flex justify-between">
                  <span>{catalogo.length} productos Â· {catPublicados} publicados</span>
                  {catBajoStock>0&&<span className="text-amber-600 font-bold flex items-center gap-1"><AlertTriangle size={11}/> {catBajoStock} con stock bajo</span>}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {catalogo.map((p: any) => (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden" onClick={() => setEditProduct(p)}>
                    {p.imagenes?.[0] ? <img src={p.imagenes[0]} alt={p.nombre} className="w-full h-40 object-cover bg-gray-100"/> : <div className="w-full h-40 bg-gray-100 flex items-center justify-center"><Package size={32} className="text-gray-300"/></div>}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-bold text-gray-900 text-sm leading-tight line-clamp-2">{p.nombre}</p>
                        <label className="shrink-0 relative inline-flex items-center cursor-pointer" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" className="sr-only peer" checked={p.publicado_web} onChange={() => togglePublicado(p)}/>
                          <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                      </div>
                      {p.categoria&&<p className="text-[10px] text-gray-400 mb-1">{p.categoria}</p>}
                      <div className="flex items-center justify-between">
                        <span className="font-black text-purple-700">{fCOP(p.precio_venta)}</span>
                        <span className={`text-[10px] font-bold ${p.stock_disponible===0?'text-red-600':p.is_low_stock?'text-amber-600':'text-emerald-600'}`}>{p.stock_disponible} uds</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PAGOS */}
        {activeTab === 'Pagos' && (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4 flex items-center gap-2"><CreditCard size={16} className="text-purple-600"/> Pasarelas de Pago</h3>
              <div className="space-y-4">
                {[{key:'stripe',label:'Stripe',sub:'Tarjetas de crÃ©dito, Apple Pay, Google Pay',fields:[{k:'publishable_key',l:'Publishable Key',ph:'pk_live_...'},{k:'secret_key',l:'Secret Key',ph:'sk_live_...',pw:true},{k:'webhook_secret',l:'Webhook Secret',ph:'whsec_...',pw:true}]},{key:'mercadopago',label:'MercadoPago',sub:'Efecty, PSE, tarjetas locales Colombia',fields:[{k:'public_key',l:'Public Key',ph:'APP_USR-...'},{k:'access_token',l:'Access Token',ph:'APP_USR-...',pw:true}]}].map(gw => (
                  <div key={gw.key} className={`border rounded-2xl p-5 ${payConfig[gw.key]?.enabled?'border-emerald-200 bg-emerald-50/30':'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div><h4 className="font-bold text-gray-800">{gw.label}</h4><p className="text-xs text-gray-500">{gw.sub}</p></div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={payConfig[gw.key]?.enabled||false} onChange={e => setPayConfig((c: any) => ({...c,[gw.key]:{...c[gw.key],enabled:e.target.checked}}))}/>
                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>
                    <div className="space-y-2">
                      {gw.fields.map(field => (
                        <div key={field.k}><label className="block text-xs font-black text-gray-400 uppercase mb-1">{field.l}</label><input type={field.pw?'password':'text'} value={payConfig[gw.key]?.[field.k]||''} onChange={e => setPayConfig((c: any) => ({...c,[gw.key]:{...c[gw.key],[field.k]:e.target.value}}))} placeholder={field.ph} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200 font-mono text-xs"/></div>
                      ))}
                    </div>
                  </div>
                ))}
                <button onClick={async()=>{setSavingPay(true);try{await apiFetch('/ecommerce/pagos/config',{method:'PATCH',body:JSON.stringify(payConfig)});showToast('ConfiguraciÃ³n guardada','ok');}catch(e:any){showToast(e.message,'error');}setSavingPay(false);}} disabled={savingPay} className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm disabled:opacity-50">
                  {savingPay?<RefreshCw size={14} className="animate-spin"/>:<Check size={14}/>} Guardar Pagos
                </button>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4 flex items-center gap-2"><Truck size={16} className="text-purple-600"/> ConfiguraciÃ³n de EnvÃ­os</h3>
              <div className="space-y-4">
                {[{k:'envio_local',l:'EnvÃ­o Local'},{k:'envio_nacional',l:'EnvÃ­o Nacional'}].map(e => (
                  <div key={e.k} className="border border-gray-200 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-gray-800">{e.l}</h4>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={shipConfig[e.k]?.enabled??true} onChange={ev => setShipConfig((c: any) => ({...c,[e.k]:{...c[e.k],enabled:ev.target.checked}}))}/>
                        <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center gap-3"><span className="text-sm text-gray-500">Tarifa:</span><input type="number" value={shipConfig[e.k]?.tarifa||0} onChange={ev => setShipConfig((c: any) => ({...c,[e.k]:{...c[e.k],tarifa:Number(ev.target.value)}}))} className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-bold w-28 outline-none"/><span className="text-xs text-gray-400">COP</span></div>
                  </div>
                ))}
                <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 flex items-center gap-3">
                  <Tag size={16} className="text-purple-600 shrink-0"/>
                  <div className="flex-1"><h4 className="font-bold text-purple-900 text-sm">EnvÃ­o Gratis desde</h4><div className="flex items-center gap-2 mt-1"><input type="number" value={shipConfig.envio_gratis_desde||200000} onChange={e => setShipConfig((c: any) => ({...c,envio_gratis_desde:Number(e.target.value)}))} className="border border-purple-200 bg-white rounded-xl px-3 py-1.5 text-sm font-bold w-32 outline-none"/><span className="text-xs text-purple-700">COP</span></div></div>
                </div>
                <button onClick={async()=>{setSavingShip(true);try{await apiFetch('/ecommerce/envios/config',{method:'PATCH',body:JSON.stringify(shipConfig)});showToast('EnvÃ­os guardados','ok');}catch(e:any){showToast(e.message,'error');}setSavingShip(false);}} disabled={savingShip} className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm disabled:opacity-50">
                  {savingShip?<RefreshCw size={14} className="animate-spin"/>:<Check size={14}/>} Guardar EnvÃ­os
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Order Detail Slide-over */}
      {selectedOrder && (
        <>
          <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40" onClick={() => setSelectedOrder(null)}/>
          <div className="fixed top-0 bottom-0 right-0 z-50 bg-white shadow-2xl w-[560px] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 bg-purple-50 flex items-center justify-between shrink-0">
              <div><h2 className="text-lg font-black text-gray-900">{selectedOrder.numero}</h2><p className="text-xs text-gray-500">{selectedOrder.pven_numero} Â· {selectedOrder.customer_name}</p></div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-purple-100 rounded-xl"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[['Cliente',selectedOrder.customer_name],['Email',selectedOrder.customer_email],['TelÃ©fono',selectedOrder.customer_phone||'-'],['Total',fCOP(selectedOrder.total_cop)],['Fecha',fDate(selectedOrder.created_at)],['Estado',selectedOrder.estado]].map(([l,v]) => (
                  <div key={l} className="bg-gray-50 rounded-2xl p-3"><p className="text-xs font-black text-gray-400 uppercase mb-1">{l}</p><p className="font-bold text-gray-900 text-sm">{v}</p></div>
                ))}
              </div>
              {(selectedOrder.productos||[]).length>0&&(
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-100"><p className="text-xs font-black text-gray-400 uppercase">Productos</p></div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-400 font-black uppercase border-b"><tr><th className="px-4 py-2 text-left">Producto</th><th className="px-4 py-2 text-center">Qty</th><th className="px-4 py-2 text-right">Precio</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {(selectedOrder.productos||[]).map((p: any, i: number) => (
                        <tr key={i}><td className="px-4 py-2">{p.nombre||p.descripcion||'-'}</td><td className="px-4 py-2 text-center">{p.qty||p.cantidad||0}</td><td className="px-4 py-2 text-right">{fCOP(p.precio||0)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
