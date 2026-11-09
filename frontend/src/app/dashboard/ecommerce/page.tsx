"use client";

import { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext, useSyncExternalStore } from 'react';
import Link from 'next/link';
// B4 T23A: entran LayoutGrid («Cuadrícula») y List (la tabla del catálogo); se van Grid, Search, Filter y MoreHorizontal (la
// búsqueda, el filtro y el menú ⋯ de las tablas hechas a mano) y el Toast propio (los avisos son los de useAvisos).
import {
  ShoppingCart, Users, AlertCircle, Package,
  Globe, CreditCard, Truck, Settings, ArrowUpRight, Plus, Eye,
  Edit2, Trash2, RefreshCw, X, Check, Image, Upload, Tag, AlertTriangle,
  Send, CheckCircle2, ShoppingBag, Layers, ToggleLeft, ToggleRight,
  MessageSquare, ExternalLink, Star, Activity, ChevronDown, ChevronUp, LayoutGrid, List
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import {
  ACCENTS, PageHeader, Drawer, FranjaKpis, TarjetaKpi, Contador, useEstadoKpi, MenuFila, ModalMotivo, TableroKanban, useTableroKanban, useAvisos,
} from '@/components/ui';
import type { ItemMenuFila } from '@/components/ui';
import {
  BarraTabla, Paginacion, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ColumnaTabla } from '@/components/tabla';
import { accionModo, dependenciasTablero, estadoDelTotal, faseDeLista, normalizarRespuesta } from '@/lib/tabla';
import type { AccionTabla } from '@/lib/tabla';
import {
  COLUMNAS_PEDIDO, OPCIONES_ESTADOS_PEDIDOS_WEB, OPCIONES_ESTADOS_TABLERO_PEDIDO, ORDEN_COLUMNA_PEDIDOS_WEB, RUTA_PEDIDOS_WEB,
  accionesTarjetaPedido, confirmacionFacturarPedido, consultaColumnaPedido, efectosCancelarPedido, reglaSoltarPedido,
  soloLecturaPedidosWeb, tarjetaPedidoWeb,
} from '@/lib/kanban-ventas';
import { infoEstadoPedido } from '@/lib/estados-pedido';
import { lecturaDeCarga, tarjetasTienda } from '@/lib/kpis';
import { formatoPesos } from '@/lib/pesos';
import { fechaCorta, fechaHoraLarga, horaCO } from '@/lib/fechas-colombia';
import { recargarTrasError } from '@/lib/avisos';
import { TABLE } from '@/lib/design-system';
import { getUsuarioActual } from '../ventas/flujo';
import { AvisoReintentar, CONTENEDOR, FOCOS } from '../inventario/piezas-inventario';
import { CHIP } from '../compras/columnas-pec';

// B4 T23A: los montos como en el resto del bloque ('$4.927.538'). Se fue PWEB_ESTADOS (nombres que no existen en los pedidos
// reales: el filtro casi nunca encontraba nada): los estados son los de estados-pedido.js (OPCIONES_ESTADOS_PEDIDOS_WEB).
const fCOP = formatoPesos;

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
   B4 T23A — los pedidos web, el catálogo y las tarjetas de la tienda (TABLA-otros punto 5, KANBAN-resto puntos 2 y 3, KPI-otros punto 5)
   El modelo es el de Pedidos de venta (T10): un estado único por tabla (useEstadoTabla), la tabla estándar y el tablero en el
   servidor con ese mismo estado, y las tarjetas con lecturaDeCarga. Las columnas son constantes del módulo; sus celdas piden lo
   suyo a la pantalla por un contexto (D40 y D41).
   ===================================================================== */

/** Una fila de GET /ecommerce/pedidos (list_web_orders, T20): los nombres son los del servidor. */
type PedidoWeb = {
  id: number;
  numero: string;
  pven_numero?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  total_cop?: number | null;
  estado: string;
  canal_venta?: string | null;
  productos?: Array<{ nombre?: string; descripcion?: string; qty?: number; cantidad?: number; precio?: number }> | null;
  created_at?: string | null;
};

/** Una fila de GET /ecommerce/catalogo (list_catalogo): las claves de _serialize_catalogo_item_canonico. */
type ProductoCatalogo = {
  id: number;
  nombre: string;
  sku?: string | null;
  categoria?: string | null;
  marca?: string | null;
  imagenes?: string[] | null;
  stock_disponible: number;
  is_low_stock?: boolean;
  precio_venta: number;
  descuento_pct?: number;
  publicado_web?: boolean;
};

/** Una fila de GET /ecommerce/carritos (list_carritos). */
type CarritoAbandonado = {
  id: number;
  customer_email?: string | null;
  total_cop?: number;
  created_at?: string | null;
  productos?: unknown[];
  recuperacion_enviada?: boolean;
  recuperacion_descuento?: number;
};

/** Lo último que llegó de una fuente que se pide otra vez: la vuelta con la que se pidió, sus datos y su error (lecturaDeCarga). */
type Cargado<T> = { vuelta: number; datos: T | null; error: unknown };

/** Los ids de las tablas: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_PEDIDOS_WEB = 'ecommerce.pedidos';
const ID_CATALOGO = 'ecommerce.catalogo';
/** El más reciente primero (el orden de la tabla y del servidor); el catálogo, por nombre como hasta hoy. */
const INICIAL_PEDIDOS_WEB = { orden: '-fecha' };
const INICIAL_CATALOGO = { orden: 'nombre' };
const RUTA_CATALOGO = '/ecommerce/catalogo';
/** Lo que se espera para que el filtro de categoría vuelva al servidor (como la búsqueda de BarraTabla: no recarga con cada tecla). */
const RETARDO_CATEGORIA_MS = 300;
const FOCO_VISIBLE = FOCOS.purple;
/** Quien hace el cambio desde el tablero (updated_by, como el Hub y los pedidos de venta). */
const autorActual = () => { const u = getUsuarioActual(); return u.name || u.email || undefined; };

/** El rol viene de localStorage: se lee después de montar y se relee cuando otra pestaña lo cambie (m14 de T19). */
const suscribirRol = (alCambiar: () => void) => {
  window.addEventListener('storage', alCambiar);
  return () => window.removeEventListener('storage', alCambiar);
};

/** Lo que las celdas de los pedidos web le piden a la pantalla. */
const AccionesPedidosWeb = createContext<{ abrir: (p: PedidoWeb) => void } | null>(null);
/** Lo que las celdas del catálogo le piden a la pantalla. */
const AccionesCatalogo = createContext<{
  editar: (p: ProductoCatalogo) => void;
  alternar: (p: ProductoCatalogo) => void;
  eliminar: (p: ProductoCatalogo) => void;
} | null>(null);

/** #PWEB: el número web y, debajo, el del pedido de venta (PVEN). */
function CeldaNumeroWeb({ p }: { p: PedidoWeb }) {
  return (
    <span className="flex min-w-0 flex-col items-start leading-tight">
      <span className="max-w-full truncate text-xs font-black text-purple-700">{p.numero}</span>
      {p.pven_numero && <span className="max-w-full truncate text-[10px] font-bold text-slate-500">{p.pven_numero}</span>}
    </span>
  );
}

/** Cliente: el nombre y, debajo, el correo. */
function CeldaClienteWeb({ p }: { p: PedidoWeb }) {
  return (
    <span className="flex min-w-0 flex-col items-start leading-tight">
      <span className="max-w-full truncate text-xs font-bold text-slate-800">{p.customer_name || '-'}</span>
      {p.customer_email && <span className="max-w-full truncate text-[10px] text-slate-500">{p.customer_email}</span>}
    </span>
  );
}

/** Estado: la insignia de estados-pedido.js (infoEstadoPedido: la misma etiqueta del filtro y del tablero; nunca el código crudo). */
function CeldaEstadoWeb({ p }: { p: PedidoWeb }) {
  const info = infoEstadoPedido(p.estado);
  return <span className={`${CHIP} text-[11px] ${info.clases.bg} ${info.clases.text} ${info.clases.border}`}>{info.label}</span>;
}

/** Acciones: el menú ⋯ de la fila (MenuFila), con «Ver detalle» (el panel del pedido, como el clic en la fila). */
function CeldaAccionesWeb({ p }: { p: PedidoWeb }) {
  const acciones = useContext(AccionesPedidosWeb);
  const items: ItemMenuFila[] = [{ etiqueta: 'Ver detalle', icono: Eye, onClick: () => acciones?.abrir(p) }];
  return (
    <span className="flex items-center justify-end">
      <MenuFila items={items} etiqueta={`Acciones de ${p.numero}`} />
    </span>
  );
}

/**
 * La tabla de los pedidos web (TABLA-otros punto 5; R26, D41): #PWEB / PVEN (clave), Cliente (la flexible), Total, Estado (clave),
 * Fecha y Acciones (fija a la derecha); Items sale oculta por defecto (R26: se muestra con «Ajustar tabla»). A 1024 px con el
 * menú abierto las visibles suman 700 px de los 704 de la caja (Estado en 148: «Pendiente de pago» se lee completo). Constantes
 * (estables, D40).
 */
const COLUMNAS_PEDIDOS_WEB: ColumnaTabla<PedidoWeb>[] = [
  { id: 'numero', titulo: 'Pedido web', ancho: 132, clave: true, fija: 'izquierda', ordenable: 'numero',
    titleCelda: (p) => [p.numero, p.pven_numero].filter(Boolean).join(' · '), celda: (p) => <CeldaNumeroWeb p={p} /> },
  { id: 'cliente', titulo: 'Cliente', ancho: 120, flexible: true, ordenable: 'cliente',
    titleCelda: (p) => [p.customer_name, p.customer_email].filter(Boolean).join(' · '), celda: (p) => <CeldaClienteWeb p={p} /> },
  { id: 'total', titulo: 'Total', ancho: 108, alinear: 'derecha', ordenable: 'total', titleCelda: (p) => fCOP(p.total_cop ?? 0),
    celda: (p) => <span className="block truncate text-xs font-black text-slate-800">{fCOP(p.total_cop ?? 0)}</span> },
  { id: 'items', titulo: 'Items', ancho: 72, alinear: 'derecha', ocultaPorDefecto: true, ordenable: 'items',
    celda: (p) => <span className="text-xs text-slate-500">{(p.productos || []).length}</span> },
  { id: 'estado', titulo: 'Estado', ancho: 148, clave: true, ordenable: 'estado', titleCelda: (p) => infoEstadoPedido(p.estado).label,
    celda: (p) => <CeldaEstadoWeb p={p} /> },
  { id: 'fecha', titulo: 'Fecha', ancho: 104, ordenable: 'fecha', titleCelda: (p) => fechaHoraLarga(p.created_at) || 'Sin fecha',
    celda: (p) => <span className="block truncate text-xs text-slate-500">{fechaCorta(p.created_at) || '-'}</span> },
  { id: 'acciones', titulo: 'Acciones', ancho: 88, clave: true, fija: 'derecha', celda: (p) => <CeldaAccionesWeb p={p} /> },
];

/** La tarjeta del tablero de los pedidos web (tarjetaPedidoWeb: la de los pedidos de venta, con el PVEN debajo del número PWEB). */
const tarjetaDePedidoWeb = (p: PedidoWeb) => tarjetaPedidoWeb(p);

/** Producto: la imagen (o el ícono), el nombre y, debajo, la marca. */
function CeldaProducto({ p }: { p: ProductoCatalogo }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {p.imagenes?.[0]
        ? <img src={p.imagenes[0]} alt="" className="h-10 w-10 shrink-0 rounded-xl border border-gray-100 object-cover" />
        : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-100"><Package size={16} className="text-gray-400" /></span>}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-xs font-bold text-gray-900">{p.nombre}</span>
        {p.marca && <span className="truncate text-[10px] text-gray-400">{p.marca}</span>}
      </span>
    </span>
  );
}

/** Stock: el disponible que ya serializa el servidor (la misma cifra por la que se ordena, RP56), en rojo sin existencias y en ámbar si es poco. */
function CeldaStock({ p }: { p: ProductoCatalogo }) {
  const color = p.stock_disponible === 0 ? 'text-red-600' : p.is_low_stock ? 'text-amber-600' : 'text-emerald-600';
  return (
    <span className={`text-xs font-bold ${color}`}>
      {p.stock_disponible} uds
      {p.is_low_stock && p.stock_disponible > 0 && <AlertTriangle size={12} aria-hidden="true" className="ml-1 inline text-amber-500" />}
    </span>
  );
}

/** Precio: el de venta y, si lo tiene, su descuento. */
function CeldaPrecio({ p }: { p: ProductoCatalogo }) {
  return (
    <span className="block truncate text-xs font-black text-gray-900">
      {fCOP(p.precio_venta)}
      {(p.descuento_pct ?? 0) > 0 && <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-black text-red-700">-{p.descuento_pct}%</span>}
    </span>
  );
}

/** Tienda: el interruptor de publicado (con su foco visible); un clic aquí no abre la fila. */
function CeldaTienda({ p }: { p: ProductoCatalogo }) {
  const acciones = useContext(AccionesCatalogo);
  return (
    <span className="flex justify-center">
      <label className="relative inline-flex cursor-pointer items-center">
        <input type="checkbox" className="peer sr-only" checked={p.publicado_web || false} onChange={() => acciones?.alternar(p)}
          aria-label={`${p.publicado_web ? 'Ocultar' : 'Publicar'} ${p.nombre} en la tienda`} />
        <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus-visible:ring-2 peer-focus-visible:ring-purple-700 peer-focus-visible:ring-offset-2"></div>
      </label>
    </span>
  );
}

/** Acciones: el menú ⋯ de la fila (MenuFila): Editar, Ocultar o Publicar y Eliminar (con confirmación de useAvisos). */
function CeldaAccionesCatalogo({ p }: { p: ProductoCatalogo }) {
  const acciones = useContext(AccionesCatalogo);
  const items: ItemMenuFila[] = [
    { etiqueta: 'Editar', icono: Edit2, onClick: () => acciones?.editar(p) },
    { etiqueta: p.publicado_web ? 'Ocultar' : 'Publicar', icono: p.publicado_web ? ToggleLeft : ToggleRight, onClick: () => acciones?.alternar(p) },
    { etiqueta: 'Eliminar', icono: Trash2, peligro: true, onClick: () => acciones?.eliminar(p) },
  ];
  return (
    <span className="flex items-center justify-end">
      <MenuFila items={items} etiqueta={`Acciones de ${p.nombre}`} />
    </span>
  );
}

/**
 * La tabla del catálogo (TABLA-otros punto 5; R26, D41): Producto (la flexible), SKU, Stock, Precio, Tienda y Acciones; Categoría
 * sale oculta por defecto (R26). Se ordena por lo que acepta el servidor: nombre, sku, categoria, stock y precio. A 1024 px con el
 * menú abierto las visibles suman 664 px de los 704 de la caja. Constantes (estables, D40).
 */
const COLUMNAS_CATALOGO: ColumnaTabla<ProductoCatalogo>[] = [
  { id: 'producto', titulo: 'Producto', ancho: 176, clave: true, flexible: true, ordenable: 'nombre',
    titleCelda: (p) => [p.nombre, p.marca].filter(Boolean).join(' · '), celda: (p) => <CeldaProducto p={p} /> },
  { id: 'sku', titulo: 'SKU', ancho: 104, ordenable: 'sku', titleCelda: (p) => p.sku || '',
    celda: (p) => <span className="block truncate font-mono text-xs text-gray-500">{p.sku || '-'}</span> },
  { id: 'categoria', titulo: 'Categoría', ancho: 112, ocultaPorDefecto: true, ordenable: 'categoria', titleCelda: (p) => p.categoria || '',
    celda: (p) => <span className="block truncate text-xs text-gray-500">{p.categoria || '-'}</span> },
  { id: 'stock', titulo: 'Stock', ancho: 88, alinear: 'derecha', ordenable: 'stock', celda: (p) => <CeldaStock p={p} /> },
  { id: 'precio', titulo: 'Precio', ancho: 136, alinear: 'derecha', ordenable: 'precio', titleCelda: (p) => fCOP(p.precio_venta),
    celda: (p) => <CeldaPrecio p={p} /> },
  { id: 'tienda', titulo: 'Tienda', ancho: 72, alinear: 'centro', titleCelda: (p) => (p.publicado_web ? 'Publicado en la tienda' : 'No publicado'),
    celda: (p) => <CeldaTienda p={p} /> },
  { id: 'acciones', titulo: 'Acciones', ancho: 88, clave: true, fija: 'derecha', celda: (p) => <CeldaAccionesCatalogo p={p} /> },
];

/** La cuadrícula del catálogo («Cuadrícula», LayoutGrid): la tarjeta de cada producto; un clic la abre para editar. */
function TarjetaProductoCuadricula({ p, onEditar, onAlternar }: { p: ProductoCatalogo; onEditar: () => void; onAlternar: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden" onClick={onEditar}>
      {p.imagenes?.[0] ? <img src={p.imagenes[0]} alt={p.nombre} className="w-full h-40 object-cover bg-gray-100"/> : <div className="w-full h-40 bg-gray-100 flex items-center justify-center"><Package size={32} className="text-gray-300"/></div>}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="font-bold text-gray-900 text-sm leading-tight line-clamp-2">{p.nombre}</p>
          <label className="shrink-0 relative inline-flex items-center cursor-pointer" onClick={e => e.stopPropagation()}>
            <input type="checkbox" className="peer sr-only" checked={p.publicado_web || false} onChange={onAlternar}
              aria-label={`${p.publicado_web ? 'Ocultar' : 'Publicar'} ${p.nombre} en la tienda`} />
            <div className="h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-focus-visible:ring-2 peer-focus-visible:ring-purple-700 peer-focus-visible:ring-offset-2"></div>
          </label>
        </div>
        {p.categoria && <p className="text-[10px] text-gray-400 mb-1">{p.categoria}</p>}
        <div className="flex items-center justify-between">
          <span className="font-black text-purple-700">{fCOP(p.precio_venta)}</span>
          <span className={`text-[10px] font-bold ${p.stock_disponible === 0 ? 'text-red-600' : p.is_low_stock ? 'text-amber-600' : 'text-emerald-600'}`}>{p.stock_disponible} uds</span>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   MAIN PAGE — EcommercePage
   ===================================================================== */
export default function EcommercePage() {
  // B4 T23A: avisos y confirmaciones de useAvisos (antes un Toast propio y el confirm() nativo del navegador).
  const { avisar, avisarError, confirmar } = useAvisos();
  const [activeTab, setActiveTab] = useState('Panel');
  const showToast = (msg: string, type = 'ok') => avisar(msg, { tono: type === 'ok' ? 'ok' : 'error' });
  const panelActivo = activeTab === 'Panel';
  const catalogoActivo = activeTab === 'Catálogo';

  const [selectedOrder, setSelectedOrder] = useState<PedidoWeb | null>(null);
  const [editProduct, setEditProduct] = useState<ProductoCatalogo | null>(null);
  const [showNewProduct, setShowNewProduct] = useState(false);
  // «Cuadrícula» (LayoutGrid) es otra forma de ver el MISMO catálogo, no un Kanban: no escribe vista:<id> (RP26, RP105).
  const [vistaCatalogo, setVistaCatalogo] = useState<'tabla' | 'cuadricula'>('tabla');
  const [payConfig, setPayConfig] = useState<any>({ stripe: { enabled: false, publishable_key: '' }, mercadopago: { enabled: false, public_key: '' } });
  const [shipConfig, setShipConfig] = useState<any>({ envio_local: { enabled: true, tarifa: 12000 }, envio_nacional: { enabled: true, tarifa: 25000 }, envio_gratis_desde: 200000 });
  const [savingPay, setSavingPay] = useState(false);
  const [savingShip, setSavingShip] = useState(false);

  // ── B4 T23A, bloque 5: las tarjetas de la tienda (KPI-otros punto 5; R12, RP102) ──
  // GET /ecommerce/stats, sin respaldo local: mientras llega la primera vez, 'cargando' (barras grises, nunca 0); al recargar
  // se conserva el último valor ('actualizando'); con error, «—» y el aviso con «Reintentar» (el detail del servidor, tal cual).
  const [vueltaStats, setVueltaStats] = useState(0);
  const [stats, setStats] = useState<Cargado<Record<string, unknown>> | null>(null);
  useEffect(() => {
    const control = new AbortController();
    apiFetch('/ecommerce/stats', { signal: control.signal })
      .then((r: { data?: Record<string, unknown> } | null) => setStats({ vuelta: vueltaStats, datos: r?.data ?? null, error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setStats({ vuelta: vueltaStats, datos: null, error: err }); });
    return () => control.abort();
  }, [vueltaStats]);
  const { datos: datosStats, cargando: cargandoStats } = lecturaDeCarga(stats, vueltaStats);
  const errorStats = cargandoStats ? null : (stats?.error ?? null);
  const estadoStats = useEstadoKpi(cargandoStats, errorStats);
  const tarjetas = tarjetasTienda(datosStats);

  // Los carritos abandonados (GET /ecommerce/carritos): lo mismo, con su error dicho en la lista y «Reintentar».
  const [vueltaCarritos, setVueltaCarritos] = useState(0);
  const [carritosCargados, setCarritosCargados] = useState<Cargado<CarritoAbandonado[]> | null>(null);
  useEffect(() => {
    if (!panelActivo) return;
    const control = new AbortController();
    apiFetch('/ecommerce/carritos?estado=ABANDONADO', { signal: control.signal })
      .then((d: { data?: CarritoAbandonado[] } | null) => setCarritosCargados({ vuelta: vueltaCarritos, datos: d?.data ?? [], error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setCarritosCargados({ vuelta: vueltaCarritos, datos: null, error: err }); });
    return () => control.abort();
  }, [panelActivo, vueltaCarritos]);
  const { datos: carritos, cargando: cargandoCarritos } = lecturaDeCarga(carritosCargados, vueltaCarritos);
  const errorCarritos = cargandoCarritos ? null : (carritosCargados?.error ?? null);
  const faseCarritos = faseDeLista({ cargandoInicial: cargandoCarritos && carritos === null, error: errorCarritos, filas: carritos });
  const estadoCarritos = useEstadoKpi(cargandoCarritos, errorCarritos);

  // ── B4 T23A, bloque 1: la carga del servidor de los pedidos web (TABLA-otros punto 5; R5; RP8, RP26, D39, D40) ──
  // Un estado ÚNICO: la búsqueda, el filtro de estados, el orden y la página de la tabla y del tablero. El modo (Lista o
  // Kanban) se guarda en vista:ecommerce.pedidos (RP26: useEstadoTabla es su único dueño). La tabla pide GET /ecommerce/pedidos
  // con q, estados en CSV, orden, limit y offset (RP8: nunca search ni estado=); esperar: !listo (D40): el esqueleto, nunca
  // «vacío». En Kanban no se pide la lista: cada columna del tablero hace su consulta.
  const [estadoPedidos, despacharPedidos, listoPedidos] = useEstadoTabla(ID_PEDIDOS_WEB, INICIAL_PEDIDOS_WEB);
  const enKanban = estadoPedidos.modo === 'kanban';
  const pedidos = useListado<PedidoWeb>({
    ruta: RUTA_PEDIDOS_WEB, estado: estadoPedidos, esperar: !listoPedidos, despachar: despacharPedidos, activo: panelActivo && !enKanban,
  });

  // ── B4 T23A, bloque 3: el tablero de los pedidos web (KANBAN-resto puntos 2 y 3; C4, R11; RP62, D39) ──
  // En modo servidor, con COLUMNAS_PEDIDO de los pedidos de venta y una consulta por columna (consultaColumnaPedido) con el MISMO
  // estado; las plegadas piden limit=0 (lo hace el hook). El rol se lee DESPUÉS de montar (useSyncExternalStore: '' en el servidor
  // y en la hidratación): sin ser ADMIN ni ASESOR el tablero queda solo para ver, con su motivo (soloLecturaPedidosWeb, RP62).
  const rol = useSyncExternalStore(suscribirRol, () => getUsuarioActual().role, () => '');
  const soloLectura = soloLecturaPedidosWeb(rol);
  const tablero = useTableroKanban<PedidoWeb>({
    pantalla: ID_PEDIDOS_WEB,
    modo: 'servidor',
    columnas: COLUMNAS_PEDIDO,
    activo: listoPedidos && enKanban && panelActivo,
    porColumna: estadoPedidos.tamano,
    dependencias: dependenciasTablero(estadoPedidos),
    ordenDe: () => ORDEN_COLUMNA_PEDIDOS_WEB,
    cargar: async (columna, { offset, limit, orden, signal }) => {
      const consulta = consultaColumnaPedido(estadoPedidos, columna, { orden, limit, offset });
      if (consulta === null) return { filas: [], total: 0 };
      return normalizarRespuesta(await apiFetch(`${RUTA_PEDIDOS_WEB}?${consulta}`, { signal }));
    },
  });

  // Lo que mueve un cambio de estado de un pedido (cancelarlo cambia las ventas de la tienda): la lista y las tarjetas; del
  // tablero, solo el origen y el destino (D39: confirmar y deshacer del hook ya los recargan).
  const { recargar: recargarPedidos } = pedidos;
  const { recargar: recargarTablero } = tablero;
  const recargarTrasCambio = useCallback(() => {
    recargarPedidos();
    setVueltaStats((n) => n + 1);
  }, [recargarPedidos]);

  // ── B4 T23A, bloque 2: la tabla de los pedidos web (D40 y D41) ──
  // Un solo usePreferenciasTabla por id (la tabla y «Ajustar tabla» comparten su resultado y el ref del ancho).
  const prefsPedidos = usePreferenciasTabla(ID_PEDIDOS_WEB, COLUMNAS_PEDIDOS_WEB);
  const anchoPedidosRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa: el conmutador sigue a la vista y el tablero no queda tapado.
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  // m2 de T8: el conmutador Lista / Kanban poda los estados con las opciones del modo nuevo (las columnas del tablero o los de la lista).
  const alCambiarBarra = useCallback((accion: AccionTabla) => {
    if (accion.tipo === 'modo') {
      const modo = String(accion.valor);
      despacharPedidos(accionModo(estadoPedidos, modo, modo === 'kanban' ? OPCIONES_ESTADOS_TABLERO_PEDIDO : OPCIONES_ESTADOS_PEDIDOS_WEB));
    } else despacharPedidos(accion);
  }, [estadoPedidos, despacharPedidos]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: pedidos.total,
    estadoTotal: estadoDelTotal({ total: pedidos.total, cargando: pedidos.cargandoInicial, recargando: pedidos.recargando, error: pedidos.error }),
  };
  const vacioPedidos = useMemo(() => {
    const q = estadoPedidos.q.trim();
    return (
      <div>
        <Globe size={32} className="mx-auto mb-3 opacity-30" aria-hidden="true" />
        <p className="font-semibold text-slate-600">{q ? `Sin resultados para «${q}»` : estadoPedidos.estados.length > 0 ? 'Sin pedidos web en esos estados' : 'Sin pedidos web'}</p>
        <p className="mt-1 text-xs text-slate-500">{q || estadoPedidos.estados.length > 0 ? 'Ajusta la búsqueda o el filtro de estados.' : 'Los pedidos PWEB-AAAA#### aparecerán aquí.'}</p>
      </div>
    );
  }, [estadoPedidos.q, estadoPedidos.estados.length]);
  const abrirPedido = useCallback((p: PedidoWeb) => setSelectedOrder(p), []);
  const accionesPedidos = useMemo(() => ({ abrir: abrirPedido }), [abrirPedido]);

  // ── bloque 3, las acciones del tablero (N2; C15, R11; D39) ──
  // reglaSoltarPedido (T3C): libre entre Pendiente de compra, En proceso y Listo para entrega; a Entregado no se arrastra
  // (Entregas elige la bodega); Facturado solo desde Entregado, con confirmación; Cancelado pide el motivo. 'cambio': PATCH
  // /ventas/pedidos/{id} (ADMIN y ASESOR). Si falla, con recargarTrasError (un 409: el pedido cambió en otro lado) se recarga
  // lo demás y el error sigue para que el tablero deshaga (eso ya recarga su origen y su destino).
  async function cambiarDesdeTablero(p: PedidoWeb, resultado: { estado: string }) {
    try {
      await apiFetch(`/ventas/pedidos/${p.id}`, {
        method: 'PATCH', body: JSON.stringify({ estado: resultado.estado, updated_by: autorActual() }),
      });
    } catch (err) {
      if (recargarTrasError(err)) recargarTrasCambio();
      throw err;
    }
    recargarTrasCambio();
  }
  // 'accion' 'facturar': confirmar() de useAvisos → PATCH {estado: 'FACTURADO'}; 'cancelar': ModalMotivo. Al terminar, del tablero
  // solo su origen y su destino.
  const [cancelando, setCancelando] = useState<{ pedido: PedidoWeb; columnas: readonly [string, string] } | null>(null);
  async function facturarDesdeTablero(p: PedidoWeb, columnas: readonly [string, string]) {
    if (!(await confirmar(confirmacionFacturarPedido(p)))) return;
    try {
      await apiFetch(`/ventas/pedidos/${p.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'FACTURADO', updated_by: autorActual() }) });
      avisar(`${p.numero} quedó Facturado`, { tono: 'ok' });
    } catch (err) {
      avisarError(err, `No se pudo facturar ${p.numero}`);
      if (!recargarTrasError(err)) return;
    }
    tablero.recargar([...columnas]);
    recargarTrasCambio();
  }
  function accionDesdeTablero(p: PedidoWeb, resultado: { accion: string }, origen: string, destino: string) {
    if (resultado.accion === 'cancelar') setCancelando({ pedido: p, columnas: [origen, destino] });
    else if (resultado.accion === 'facturar') void facturarDesdeTablero(p, [origen, destino]);
  }
  // 'cancelar' (N2, H45, H46): ModalMotivo (5 letras o más) → PATCH {estado: 'CANCELADO', cancellation_reason} (el servidor deja
  // el motivo en la Actividad). Si falla, con recargarTrasError se recargan el origen y el destino del tablero y lo demás, y el
  // error sigue (throw) para que ModalMotivo lo muestre y conserve lo escrito.
  async function cancelarConMotivo(motivo: string) {
    if (!cancelando) return;
    const { pedido, columnas } = cancelando;
    const autor = autorActual();
    try {
      await apiFetch(`/ventas/pedidos/${pedido.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: 'CANCELADO', cancellation_reason: motivo, cancellation_authorized_by: autor, updated_by: autor }),
      });
    } catch (err) {
      if (recargarTrasError(err)) {
        tablero.recargar([...columnas]);
        recargarTrasCambio();
      }
      throw err;
    }
    avisar(`${pedido.numero} cancelado`, { tono: 'ok' });
    tablero.recargar([...columnas]);
    recargarTrasCambio();
  }
  // accionesTarjeta: «Marcar En tránsito» y «Marcar En proceso» sin salir de la columna En proceso (accionesTarjetaPedido: solo lo
  // que acepta el PATCH). Un rol que no mueve pedidos (soloLectura) no las ve: darían 403.
  const marcarDesdeTablero = useCallback(async (p: PedidoWeb, nuevo: string) => {
    try {
      await apiFetch(`/ventas/pedidos/${p.id}`, { method: 'PATCH', body: JSON.stringify({ estado: nuevo, updated_by: autorActual() }) });
      avisar(`${p.numero} pasó a ${infoEstadoPedido(nuevo).label}`, { tono: 'ok' });
    } catch (err) {
      avisarError(err, `No se pudo cambiar el estado de ${p.numero}`);
      if (!recargarTrasError(err)) return;
    }
    recargarTablero(['en_proceso']);
    recargarTrasCambio();
  }, [avisar, avisarError, recargarTablero, recargarTrasCambio]);
  const accionesTarjeta = useCallback((p: PedidoWeb): ItemMenuFila[] => (soloLectura ? [] : accionesTarjetaPedido(p).map((a) => ({
    etiqueta: a.etiqueta, icono: a.estado === 'EN_TRANSITO' ? Truck : Package, onClick: () => { void marcarDesdeTablero(p, a.estado); },
  }))), [soloLectura, marcarDesdeTablero]);

  // ── B4 T23A, bloque 4: el catálogo en la tabla estándar del servidor (TABLA-otros punto 5; RP56) ──
  // Mismo patrón. GET /ecommerce/catalogo manda SIEMPRE offset (aunque sea 0: queryListado) para que el servidor pagine exacto y
  // dé el total real; sin offset ni orden responde como la tienda pública, con un total que no es exacto. El filtro de
  // categoría va al servidor con el mismo retardo de la búsqueda (no recarga con cada tecla) y vuelve a la página 1.
  const [estadoCatalogo, despacharCatalogo, listoCatalogo] = useEstadoTabla(ID_CATALOGO, INICIAL_CATALOGO);
  const [categoriaTexto, setCategoriaTexto] = useState('');
  const [categoria, setCategoria] = useState('');
  const categoriaAplicada = useRef('');
  useEffect(() => {
    const espera = setTimeout(() => {
      const nueva = categoriaTexto.trim();
      if (nueva === categoriaAplicada.current) return;
      categoriaAplicada.current = nueva;
      setCategoria(nueva);
      despacharCatalogo({ tipo: 'pagina', valor: 1 });
    }, RETARDO_CATEGORIA_MS);
    return () => clearTimeout(espera);
  }, [categoriaTexto, despacharCatalogo]);
  const catalogo = useListado<ProductoCatalogo>({
    ruta: RUTA_CATALOGO, estado: estadoCatalogo, extra: { categoria }, esperar: !listoCatalogo, despachar: despacharCatalogo, activo: catalogoActivo,
  });
  const prefsCatalogo = usePreferenciasTabla(ID_CATALOGO, COLUMNAS_CATALOGO);
  const anchoCatalogoRef = useRef<number | null>(null);
  const faseCatalogo = faseDeLista({ cargandoInicial: catalogo.cargandoInicial, error: catalogo.error, filas: catalogo.filas });
  const totalCatalogoBarra = {
    total: catalogo.total,
    estadoTotal: estadoDelTotal({ total: catalogo.total, cargando: catalogo.cargandoInicial, recargando: catalogo.recargando, error: catalogo.error }),
  };
  const vacioCatalogo = useMemo(() => {
    const q = estadoCatalogo.q.trim();
    const filtrado = q !== '' || categoria !== '';
    return (
      <div>
        <Package size={32} className="mx-auto mb-3 opacity-30" aria-hidden="true" />
        <p className="font-semibold text-slate-600">{filtrado ? 'Sin productos con esos filtros' : 'Sin productos'}</p>
        {!filtrado && (
          <button type="button" onClick={() => setShowNewProduct(true)} className={`mt-3 rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white ${FOCO_VISIBLE}`}>+ Nuevo Producto</button>
        )}
      </div>
    );
  }, [estadoCatalogo.q, categoria]);

  // Un cambio del catálogo (publicar, ocultar, eliminar o guardar un producto) mueve el catálogo y el «Productos publicados» de las tarjetas.
  const { recargar: recargarCatalogo } = catalogo;
  const recargarTrasCatalogo = useCallback(() => {
    recargarCatalogo();
    setVueltaStats((n) => n + 1);
  }, [recargarCatalogo]);

  const togglePublicado = useCallback(async (prod: ProductoCatalogo) => {
    try {
      await apiFetch(`/ecommerce/catalogo/${prod.id}`, { method: 'PATCH', body: JSON.stringify({ publicado_web: !prod.publicado_web }) });
      avisar(prod.publicado_web ? 'Producto ocultado' : 'Producto publicado en tienda', { tono: 'ok' });
      recargarTrasCatalogo();
    } catch (e) { avisarError(e, 'No se pudo cambiar la publicación'); }
  }, [avisar, avisarError, recargarTrasCatalogo]);

  // El confirm() nativo («¿Eliminar este producto?») pasa a confirmar de useAvisos (RP30).
  const deleteProduct = useCallback(async (prod: ProductoCatalogo) => {
    if (!(await confirmar({ titulo: 'Eliminar producto', mensaje: '¿Eliminar este producto?', efectos: [prod.nombre], textoConfirmar: 'Eliminar', peligro: true }))) return;
    try {
      await apiFetch(`/ecommerce/catalogo/${prod.id}`, { method: 'DELETE' });
      avisar('Producto eliminado', { tono: 'ok' });
      recargarTrasCatalogo();
    } catch (e) { avisarError(e, 'No se pudo eliminar el producto'); }
  }, [avisar, avisarError, confirmar, recargarTrasCatalogo]);
  const accionesCatalogo = useMemo(() => ({ editar: setEditProduct, alternar: togglePublicado, eliminar: deleteProduct }), [togglePublicado, deleteProduct]);

  const recuperarCarrito = async (cartId: number, descuento = 10) => {
    try {
      await apiFetch(`/ecommerce/carritos/${cartId}/recuperar`, { method: 'PATCH', body: JSON.stringify({ descuento_pct: descuento }) });
      showToast(`Recuperación enviada con ${descuento}% descuento`, 'ok');
      setVueltaCarritos((n) => n + 1);
    } catch (e) { avisarError(e, 'No se pudo enviar la recuperación'); }
  };

  useEffect(() => {
    if (activeTab === 'Pagos') {
      apiFetch('/ecommerce/pagos/config').then(d => setPayConfig(d.data || payConfig)).catch(() => {});
      apiFetch('/ecommerce/envios/config').then(d => setShipConfig(d.data || shipConfig)).catch(() => {});
    }
  }, [activeTab]);

  // «Actualizar»: las tarjetas, los carritos, los pedidos (la tabla y el tablero) y el catálogo. Ninguna recarga vacía lo que se ve.
  const recargarTodo = useCallback(() => {
    setVueltaStats((n) => n + 1);
    setVueltaCarritos((n) => n + 1);
    recargarPedidos();
    recargarTablero();
    recargarCatalogo();
  }, [recargarPedidos, recargarTablero, recargarCatalogo]);
  const actualizando = cargandoStats || pedidos.recargando || catalogo.recargando;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {(showNewProduct || editProduct) && (
        <ProductModal product={editProduct || null} onSave={recargarTrasCatalogo} onClose={() => { setShowNewProduct(false); setEditProduct(null); }} onToast={showToast} />
      )}

      {/* B4 T23A: el contenedor de las listas del bloque (px-4 hasta xl y pb-24 para la esquina del botón de la IA): a 1024 px con el
          menú abierto las columnas clave caben (R26). */}
      <div className={CONTENEDOR}>
        {/* HEADER */}
        <PageHeader icon={ShoppingCart} color="purple"
          title="E-Commerce Center"
          subtitle="Gestión de ventas web · PWEB-YYYY#### · Catálogo Digital"
          actions={(
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <button type="button" onClick={recargarTodo} className={`flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm shadow-sm ${FOCO_VISIBLE}`}>
                <RefreshCw size={14} aria-hidden="true" className={actualizando ? 'animate-spin' : ''}/> Actualizar
              </button>
              <Link href="/store" target="_blank" className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm shadow-sm">
                <Globe size={14}/> Ver Tienda
              </Link>
              {activeTab === 'Catálogo' && (
                <button onClick={() => setShowNewProduct(true)} className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm shadow-sm">
                  <Plus size={15}/> Nuevo Producto
                </button>
              )}
            </div>
          )} />

        {/* B4 T23A (KPI-otros punto 5; R12, RP102): las 4 tarjetas de la tienda con los nombres de CATALOGO_KPI: 'cargando' la
            primera vez, 'actualizando' al recargar y «—» con error (con su aviso y «Reintentar»). Ventas de hoy contra ayer y del
            mes contra el mismo tramo del mes pasado, en hora de Colombia (lo cuenta el servidor). Ninguna es botón: ninguna
            equivale a una vista. */}
        {errorStats && (
          <AvisoReintentar error={errorStats} fallo="No se pudieron cargar los indicadores de la tienda" onReintentar={() => setVueltaStats((n) => n + 1)} acento="purple" />
        )}
        <FranjaKpis estado={estadoStats} titulo="Indicadores de la tienda">
          <TarjetaKpi kpi="web_ventas_hoy" valor={tarjetas.web_ventas_hoy.valor} variacion={tarjetas.web_ventas_hoy.variacion} textoPeriodo={tarjetas.web_ventas_hoy.textoPeriodo} ayuda={tarjetas.web_ventas_hoy.ayuda ?? undefined} />
          <TarjetaKpi kpi="web_ventas_mes" valor={tarjetas.web_ventas_mes.valor} variacion={tarjetas.web_ventas_mes.variacion} textoPeriodo={tarjetas.web_ventas_mes.textoPeriodo} ayuda={tarjetas.web_ventas_mes.ayuda ?? undefined} />
          <TarjetaKpi kpi="carritos_abandonados" valor={tarjetas.carritos_abandonados.valor} tono={tarjetas.carritos_abandonados.tono} ayuda={tarjetas.carritos_abandonados.ayuda ?? undefined} />
          <TarjetaKpi kpi="productos_publicados" valor={tarjetas.productos_publicados.valor} />
        </FranjaKpis>

        {/* TABS */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm overflow-x-auto">
            {['Panel', 'Catálogo', 'Clientes Web', 'Pagos'].map(t => (
              <button key={t} type="button" onClick={() => setActiveTab(t)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${FOCO_VISIBLE} ${activeTab === t ? 'bg-purple-600 text-white shadow' : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'}`}>{t}</button>
            ))}
          </div>
          {/* «Cuadrícula» (LayoutGrid, «Vista en cuadrícula», RP105): otra forma de ver el catálogo; no es un Kanban y no escribe vista:. */}
          {activeTab === 'Catálogo' && (
            <div role="group" aria-label="Vista del catálogo" className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5 shadow-xs">
              <button type="button" onClick={() => setVistaCatalogo('tabla')} aria-pressed={vistaCatalogo === 'tabla'} title="Vista de tabla"
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${FOCO_VISIBLE} ${vistaCatalogo === 'tabla' ? ACCENTS.purple.navActive : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}>
                <List size={14} aria-hidden="true" /> Tabla
              </button>
              <button type="button" onClick={() => setVistaCatalogo('cuadricula')} aria-pressed={vistaCatalogo === 'cuadricula'} title="Vista en cuadrícula"
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${FOCO_VISIBLE} ${vistaCatalogo === 'cuadricula' ? ACCENTS.purple.navActive : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}>
                <LayoutGrid size={14} aria-hidden="true" /> Cuadrícula
              </button>
            </div>
          )}
        </div>

        {/* PANEL: los carritos abandonados y los pedidos web (B4 T23A: la tabla estándar del servidor o su tablero). A 1024 px con el
            menú abierto los pedidos van arriba y a todo el ancho (los carritos, debajo): R26; desde 2xl, los carritos a la izquierda. */}
        {activeTab === 'Panel' && (
          <div className="flex min-w-0 flex-1 flex-col gap-6 2xl:flex-row">
            <div className="order-2 flex w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm 2xl:order-1 2xl:w-80 2xl:self-start">
              <div className="p-5 border-b border-gray-100 bg-rose-50/50 flex items-center justify-between">
                <h3 className="font-black text-gray-800 text-sm flex items-center gap-2"><AlertCircle className="text-rose-500" size={16}/> Recuperación de Carritos</h3>
                <span className="bg-rose-100 text-rose-700 text-xs font-black px-2 py-0.5 rounded-full"><Contador valor={carritos === null ? null : carritos.length} estado={estadoCarritos} /></span>
              </div>
              <div className="max-h-96 flex-1 overflow-y-auto p-4 space-y-3 2xl:max-h-[32rem]">
                {faseCarritos === 'cargando' && (
                  <div role="status" aria-label="Cargando los carritos" className="space-y-3">
                    {[0, 1, 2].map((i) => <div key={i} aria-hidden="true" className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}
                  </div>
                )}
                {faseCarritos === 'error' && (
                  <AvisoReintentar error={errorCarritos} fallo="No se pudieron cargar los carritos abandonados" onReintentar={() => setVueltaCarritos((n) => n + 1)} acento="purple" />
                )}
                {faseCarritos === 'vacio' && <div className="text-center py-10 text-gray-400"><ShoppingCart size={28} className="mx-auto mb-2 opacity-30"/><p className="text-sm">Sin carritos abandonados</p></div>}
                {faseCarritos === 'filas' && (carritos ?? []).map((c) => (
                  <div key={c.id} className="border border-gray-100 p-4 rounded-2xl hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-gray-800 text-xs truncate">{c.customer_email||'Anónimo'}</p>
                      <span className="text-xs font-black text-gray-700 shrink-0">{fCOP(c.total_cop ?? 0)}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mb-2">{[fechaCorta(c.created_at), horaCO(c.created_at)].filter(Boolean).join(', ') || '-'} · {(c.productos||[]).length} productos</p>
                    {c.recuperacion_enviada ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-bold flex items-center gap-1"><Check size={10}/> Recuperación enviada ({c.recuperacion_descuento}% dto)</span>
                    ) : (
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => recuperarCarrito(c.id,10)} className={`flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold py-1.5 rounded-lg border border-rose-100 ${FOCO_VISIBLE}`}>Enviar 10% Dto</button>
                        <button type="button" onClick={() => recuperarCarrito(c.id,15)} className={`flex-1 bg-orange-50 hover:bg-orange-100 text-orange-600 text-[10px] font-bold py-1.5 rounded-lg border border-orange-100 ${FOCO_VISIBLE}`}>15% Dto</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="order-1 flex min-w-0 flex-1 flex-col gap-4 2xl:order-2">
              <h3 className="font-black text-gray-800 text-sm flex items-center gap-2"><ShoppingBag size={16} className="text-purple-600"/> Pedidos web (PWEB)</h3>
              {/* La barra (búsqueda al servidor con retardo, filtro de estados reales, «Ajustar tabla», Lista / Kanban y pantalla
                  completa) y la tabla estándar en el servidor, o el tablero con el MISMO estado. */}
              {capa}
              <AccionesPedidosWeb.Provider value={accionesPedidos}>
                <section ref={refTarjeta} className={claseTarjeta}>
                  <BarraTabla
                    estado={estadoPedidos}
                    onEstado={alCambiarBarra}
                    placeholder="Buscar PWEB, cliente o producto…"
                    opcionesEstados={enKanban ? OPCIONES_ESTADOS_TABLERO_PEDIDO : OPCIONES_ESTADOS_PEDIDOS_WEB}
                    ajustes={{ columnas: COLUMNAS_PEDIDOS_WEB, preferencias: prefsPedidos, anchoRef: anchoPedidosRef }}
                    kanbanDisponible
                    pantallaCompleta={enKanban ? undefined : { completa, alternar }}
                    color="purple"
                    {...totalDeLaBarra}
                  />
                  {!enKanban && (
                    <TablaEstandar
                      id={ID_PEDIDOS_WEB}
                      modo="servidor"
                      columnas={COLUMNAS_PEDIDOS_WEB}
                      preferencias={prefsPedidos}
                      anchoRef={anchoPedidosRef}
                      estado={estadoPedidos}
                      onEstado={despacharPedidos}
                      filas={pedidos.filas}
                      total={pedidos.total}
                      cargando={pedidos.cargandoInicial}
                      recargando={pedidos.recargando}
                      error={pedidos.error}
                      onReintentar={pedidos.recargar}
                      aviso={pedidos.avisoOrden}
                      onFila={abrirPedido}
                      vacio={vacioPedidos}
                      etiqueta="Pedidos web"
                    />
                  )}
                </section>
              </AccionesPedidosWeb.Provider>
              {/* El tablero en modo servidor (Pendiente de compra · En proceso · Listo para entrega · Entregado · Facturado y
                  Cancelado plegadas), con las reglas de los pedidos de venta. Para un rol que no mueve pedidos queda solo para ver. */}
              {enKanban && (
                <TableroKanban
                  tablero={tablero}
                  regla={reglaSoltarPedido}
                  tarjetaDe={tarjetaDePedidoWeb}
                  onAbrir={abrirPedido}
                  onCambio={cambiarDesdeTablero}
                  onAccion={accionDesdeTablero}
                  accionesTarjeta={accionesTarjeta}
                  soloLectura={soloLectura}
                  color="purple"
                />
              )}
            </div>
          </div>
        )}

        {/* El motivo de la cancelación desde el tablero (ModalMotivo, nunca prompt), con lo que dice el modal del pedido (N2, H45, H46). */}
        {cancelando && (
          <ModalMotivo
            titulo={`Cancelar ${cancelando.pedido.numero}`}
            efectos={efectosCancelarPedido(cancelando.pedido)}
            textoConfirmar="Cancelar pedido"
            placeholder="Ej: Cliente desistió de la compra, error en el pedido, etc."
            onConfirmar={cancelarConMotivo}
            onCerrar={() => setCancelando(null)}
          />
        )}

        {/* CATÁLOGO (B4 T23A): la tabla estándar del servidor (con el total real) o «Cuadrícula» (las tarjetas de la misma página). */}
        {activeTab === 'Catálogo' && (
          <AccionesCatalogo.Provider value={accionesCatalogo}>
            <section className={`${TABLE.tarjeta} min-w-0`}>
              <BarraTabla
                estado={estadoCatalogo}
                onEstado={despacharCatalogo}
                placeholder="Buscar producto, SKU…"
                ajustes={vistaCatalogo === 'tabla' ? { columnas: COLUMNAS_CATALOGO, preferencias: prefsCatalogo, anchoRef: anchoCatalogoRef } : undefined}
                filtros={(
                  <input value={categoriaTexto} onChange={(e) => setCategoriaTexto(e.target.value)} maxLength={80} aria-label="Filtrar por categoría" placeholder="Filtrar categoría…"
                    className={`w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 placeholder:font-normal ${FOCO_VISIBLE}`} />
                )}
                color="purple"
                {...totalCatalogoBarra}
              />
              {vistaCatalogo === 'tabla' ? (
                <TablaEstandar
                  id={ID_CATALOGO}
                  modo="servidor"
                  columnas={COLUMNAS_CATALOGO}
                  preferencias={prefsCatalogo}
                  anchoRef={anchoCatalogoRef}
                  estado={estadoCatalogo}
                  onEstado={despacharCatalogo}
                  filas={catalogo.filas}
                  total={catalogo.total}
                  cargando={catalogo.cargandoInicial}
                  recargando={catalogo.recargando}
                  error={catalogo.error}
                  onReintentar={catalogo.recargar}
                  aviso={catalogo.avisoOrden}
                  onFila={setEditProduct}
                  vacio={vacioCatalogo}
                  etiqueta="Catálogo de productos"
                />
              ) : (
                <div className="flex min-w-0 flex-col gap-4 p-4">
                  {faseCatalogo === 'cargando' && (
                    <div role="status" aria-label="Cargando el catálogo" className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-slate-100" />)}
                    </div>
                  )}
                  {faseCatalogo === 'error' && (
                    <AvisoReintentar error={catalogo.error} fallo="No se pudo cargar el catálogo" onReintentar={catalogo.recargar} acento="purple" />
                  )}
                  {faseCatalogo === 'vacio' && <div className="py-12 text-center text-gray-400">{vacioCatalogo}</div>}
                  {(faseCatalogo === 'filas' || (faseCatalogo === 'error' && catalogo.filas.length > 0)) && (
                    <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 ${catalogo.recargando ? 'opacity-60' : ''}`}>
                      {catalogo.filas.map((p) => (
                        <TarjetaProductoCuadricula key={p.id} p={p} onEditar={() => setEditProduct(p)} onAlternar={() => togglePublicado(p)} />
                      ))}
                    </div>
                  )}
                  {catalogo.total !== null && catalogo.total > 0 && (
                    <div className="flex items-center border-t border-slate-100 pt-3 text-xs text-slate-500">
                      <Paginacion pagina={estadoCatalogo.pagina} tamano={estadoCatalogo.tamano} total={catalogo.total}
                        onPagina={(pagina) => despacharCatalogo({ tipo: 'pagina', valor: pagina })} onTamano={(tamano) => despacharCatalogo({ tipo: 'tamano', valor: tamano })} />
                    </div>
                  )}
                </div>
              )}
            </section>
          </AccionesCatalogo.Provider>
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
        <Drawer onClose={() => setSelectedOrder(null)} header={(
          <div><h2 className="text-lg font-black text-gray-900">{selectedOrder.numero}</h2><p className="text-xs text-gray-500">{selectedOrder.pven_numero} · {selectedOrder.customer_name}</p></div>
        )}>
              <div className="grid grid-cols-2 gap-3">
                {[['Cliente',selectedOrder.customer_name],['Email',selectedOrder.customer_email],['Teléfono',selectedOrder.customer_phone||'-'],['Total',fCOP(selectedOrder.total_cop ?? 0)],['Fecha',fechaCorta(selectedOrder.created_at) || '-'],['Estado',infoEstadoPedido(selectedOrder.estado).label]].map(([l,v]) => (
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
        </Drawer>
      )}
    </div>
  );
}
