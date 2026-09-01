'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Package, Search, Filter, Plus, ChevronLeft, Save,
  Globe, Tag, Layers, DollarSign, RefreshCw, AlertCircle
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

const TABS = ['Informacion General', 'SKUs y Variantes', 'Stock', 'E-Commerce'];

export default function ProductosPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [canSell, setCanSell] = useState(true);
  const [canBuy, setCanBuy] = useState(true);
  const [isPublished, setIsPublished] = useState(false);

  const isNew = selectedProduct === 'NEW';

  const [form, setForm] = useState({
    name: '', description: '', type: 'Fisico', base_currency: 'COP',
    uom: 'Unidad', brand_id: '', category_id: '',
    sale_price: '', cost_price: '', tax_rate: 0, reference: '',
    track_inventory: true, auto_replenish: false, is_active: true,
    is_published: false, ecommerce_category: '', low_stock_alert: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const d = await apiFetch(`/products?${params}&limit=100`);
      setProducts(Array.isArray(d) ? d : (d?.data ?? d?.products ?? []));
      setTotal(d?.total ?? (Array.isArray(d) ? d.length : 0));
    } catch { setProducts([]); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => {
    load();
    apiFetch('/categories').then(d => setCategories(Array.isArray(d) ? d : (d?.data ?? []))).catch(()=>{});
    apiFetch('/brands').then(d => setBrands(Array.isArray(d) ? d : (d?.data ?? []))).catch(()=>{});
    apiFetch('/inventory/warehouses').then(d => setWarehouses(Array.isArray(d) ? d : (d?.data ?? []))).catch(()=>{});
  }, [load]);

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, is_published: isPublished };
      if (isNew) {
        await apiFetch('/products', { method: 'POST', body: JSON.stringify(body) });
      } else {
        await apiFetch(`/products/${selectedProduct.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
      setSelectedProduct(null);
      load();
    } catch (err: any) { alert(err.message); }
    setSaving(false);
  }

  function openNew() {
    setForm({ name: '', description: '', type: 'Fisico', base_currency: 'COP', uom: 'Unidad',
      brand_id: '', category_id: '', sale_price: '', cost_price: '', tax_rate: 0, reference: '',
      track_inventory: true, auto_replenish: false, is_active: true, is_published: false, ecommerce_category: '', low_stock_alert: 0 });
    setIsPublished(false);
    setActiveTab(TABS[0]);
    setSelectedProduct('NEW');
  }

  function openEdit(p: any) {
    setForm({
      name: p.name || '', description: p.description || '', type: p.type || 'Fisico',
      base_currency: p.base_currency || 'COP', uom: p.uom || 'Unidad',
      brand_id: p.brand_id || '', category_id: p.category_id || '',
      sale_price: p.sale_price || '', cost_price: p.cost_price || '', tax_rate: p.tax_rate || 0,
      reference: p.reference || '', track_inventory: p.track_inventory ?? true,
      auto_replenish: p.auto_replenish ?? false, is_active: p.is_active ?? true,
      is_published: p.is_published ?? false, ecommerce_category: p.ecommerce_category || '',
      low_stock_alert: p.low_stock_alert || 0,
    });
    setIsPublished(p.is_published ?? false);
    setActiveTab(TABS[0]);
    setSelectedProduct(p);
  }

  // ─── PRODUCT LIST ───
  if (!selectedProduct) {
    return (
      <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-5 overflow-y-auto">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-purple-600">
              <Package size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Catalogo de Productos</h1>
              <p className="text-slate-500 text-sm mt-1">{total} productos • Sincronizado con E-commerce</p>
            </div>
          </div>
          <button onClick={openNew}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm flex items-center gap-2">
            <Plus size={18} /> Nuevo Producto
          </button>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, SKU, referencia..."
                  className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm w-80 outline-none focus:border-purple-400" />
              </div>
              <button onClick={load} className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            <span className="text-sm text-slate-500">Total: <span className="font-bold text-slate-800">{total} productos</span></span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center pt-16"><RefreshCw size={24} className="animate-spin text-purple-400" /></div>
            ) : products.length === 0 ? (
              <div className="text-center pt-16 text-slate-400">
                <Package size={48} className="mx-auto mb-4 opacity-20" />
                <p>Sin productos. Crea el primero.</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider sticky top-0">
                    <th className="px-6 py-4 font-bold">Producto</th>
                    <th className="px-6 py-4 font-bold">Tipo</th>
                    <th className="px-6 py-4 font-bold">Precio Venta</th>
                    <th className="px-6 py-4 font-bold">Costo</th>
                    <th className="px-6 py-4 font-bold text-center">E-Commerce</th>
                    <th className="px-6 py-4 font-bold text-center">Activo</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p: any) => (
                    <tr key={p.id} onClick={() => openEdit(p)}
                      className="border-b border-slate-50 cursor-pointer hover:bg-purple-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800">{p.name}</div>
                        {p.reference && <div className="text-xs text-slate-400">Ref: {p.reference}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{p.type}</span>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">
                        {p.sale_price ? `$${Number(p.sale_price).toLocaleString('es-CO')}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {p.cost_price ? `$${Number(p.cost_price).toLocaleString('es-CO')}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${p.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          <Globe size={10} />{p.is_published ? 'Publicado' : 'No publicado'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`w-2 h-2 rounded-full inline-block ${p.is_active ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── PRODUCT FORM ───
  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col overflow-hidden">
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center gap-4 flex-shrink-0">
        <button onClick={() => setSelectedProduct(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="font-extrabold text-xl text-slate-900">{isNew ? 'Nuevo Producto' : form.name}</h1>
          {!isNew && selectedProduct?.reference && <p className="text-xs text-slate-400">Ref: {selectedProduct.reference}</p>}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={canSell} onChange={e=>setCanSell(e.target.checked)} className="w-4 h-4" />
            <span className="font-medium text-slate-600">Se puede vender</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={canBuy} onChange={e=>setCanBuy(e.target.checked)} className="w-4 h-4" />
            <span className="font-medium text-slate-600">Se puede comprar</span>
          </label>
          <button onClick={saveProduct} disabled={saving}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-100 px-6 flex-shrink-0">
        <div className="flex gap-0">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === tab ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={saveProduct} className="flex-1 overflow-y-auto p-6">
        {activeTab === 'Informacion General' && (
          <div className="grid grid-cols-3 gap-6 max-w-5xl">
            <div className="col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Nombre del Producto *</label>
                <input required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Descripcion</label>
                <textarea rows={3} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Tipo</label>
                  <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
                    <option>Fisico</option><option>Servicio</option><option>Experiencia</option><option>Digital</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Unidad de Medida</label>
                  <select value={form.uom} onChange={e=>setForm(f=>({...f,uom:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
                    <option>Unidad</option><option>Kg</option><option>Lb</option><option>Metro</option><option>Litro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Categoria</label>
                  <select value={form.category_id} onChange={e=>setForm(f=>({...f,category_id:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
                    <option value="">Seleccionar...</option>
                    {categories.map((c:any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Marca</label>
                  <select value={form.brand_id} onChange={e=>setForm(f=>({...f,brand_id:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
                    <option value="">Seleccionar...</option>
                    {brands.map((b:any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Referencia Interna</label>
                  <input value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Moneda Base</label>
                  <select value={form.base_currency} onChange={e=>setForm(f=>({...f,base_currency:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
                    <option>COP</option><option>USD</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h3 className="font-black text-sm text-slate-700 mb-3 flex items-center gap-2"><DollarSign size={14} className="text-indigo-500" /> Precios</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Precio de Venta</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                      <input type="number" value={form.sale_price} onChange={e=>setForm(f=>({...f,sale_price:e.target.value}))}
                        className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-sm outline-none focus:border-purple-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Costo</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                      <input type="number" value={form.cost_price} onChange={e=>setForm(f=>({...f,cost_price:e.target.value}))}
                        className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-sm outline-none focus:border-purple-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Impuesto %</label>
                    <input type="number" value={form.tax_rate} min={0} max={100}
                      onChange={e=>setForm(f=>({...f,tax_rate:parseFloat(e.target.value)||0}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h3 className="font-black text-sm text-slate-700 mb-3 flex items-center gap-2"><Layers size={14} className="text-purple-500" /> Inventario</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.track_inventory}
                      onChange={e=>setForm(f=>({...f,track_inventory:e.target.checked}))} className="w-4 h-4" />
                    <span className="text-sm text-slate-600">Rastrear inventario</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.auto_replenish}
                      onChange={e=>setForm(f=>({...f,auto_replenish:e.target.checked}))} className="w-4 h-4" />
                    <span className="text-sm text-slate-600">Reabastecimiento automatico</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_active}
                      onChange={e=>setForm(f=>({...f,is_active:e.target.checked}))} className="w-4 h-4" />
                    <span className="text-sm text-slate-600">Activo</span>
                  </label>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Alerta stock minimo</label>
                    <input type="number" value={form.low_stock_alert} min={0}
                      onChange={e=>setForm(f=>({...f,low_stock_alert:parseInt(e.target.value)||0}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'SKUs y Variantes' && (
          <div className="max-w-3xl">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 mb-6">
              <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-700">Gestion de SKUs</p>
                <p className="text-xs text-amber-600 mt-0.5">Los SKUs y variantes se gestionan despues de guardar el producto.</p>
              </div>
            </div>
            {!isNew && selectedProduct?.skus?.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50"><tr className="text-xs text-slate-400 uppercase">
                    <th className="px-4 py-3 text-left">SKU</th><th className="px-4 py-3 text-left">Variantes</th>
                    <th className="px-4 py-3 text-right">Costo</th><th className="px-4 py-3 text-right">Precio</th>
                  </tr></thead>
                  <tbody>
                    {selectedProduct.skus.map((s: any) => (
                      <tr key={s.id} className="border-t border-slate-50">
                        <td className="px-4 py-3 font-mono text-sm">{s.sku}</td>
                        <td className="px-4 py-3 text-slate-600">{s.attributes?.join(', ') || '-'}</td>
                        <td className="px-4 py-3 text-right">${Number(s.cost_price||0).toLocaleString('es-CO')}</td>
                        <td className="px-4 py-3 text-right">${Number(s.sale_price||0).toLocaleString('es-CO')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">Sin SKUs configurados.</p>
            )}
          </div>
        )}

        {activeTab === 'Stock' && (
          <div className="max-w-3xl">
            {!isNew && selectedProduct?.inventory_levels?.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50"><tr className="text-xs text-slate-400 uppercase">
                    <th className="px-4 py-3 text-left">Bodega</th><th className="px-4 py-3 text-right">Stock</th>
                  </tr></thead>
                  <tbody>
                    {selectedProduct.inventory_levels.map((l: any) => (
                      <tr key={l.id} className="border-t border-slate-50">
                        <td className="px-4 py-3">{l.warehouse_name || `Bodega #${l.warehouse_id}`}</td>
                        <td className="px-4 py-3 text-right font-bold">{l.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-8 text-center text-slate-400">
                <Package size={32} className="mx-auto mb-3 opacity-30" />
                <p>Sin stock registrado. El stock se actualiza automaticamente cuando se confirma una Recepcion (ENINV).</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'E-Commerce' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-slate-700 flex items-center gap-2"><Globe size={14} className="text-emerald-500" /> Estado de Publicacion</h3>
                <button type="button" onClick={() => setIsPublished(!isPublished)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isPublished ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isPublished ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <p className={`text-sm font-bold ${isPublished ? 'text-emerald-600' : 'text-slate-400'}`}>
                {isPublished ? 'Publicado en la tienda web' : 'No publicado'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-black text-slate-700 flex items-center gap-2"><Tag size={14} className="text-indigo-500" /> Configuracion E-Commerce</h3>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Categoria en Tienda</label>
                <input value={form.ecommerce_category} onChange={e=>setForm(f=>({...f,ecommerce_category:e.target.value}))}
                  placeholder="Ej: Accesorios, Electronica, Ropa..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Alerta de stock bajo</label>
                <input type="number" min={0} value={form.low_stock_alert}
                  onChange={e=>setForm(f=>({...f,low_stock_alert:parseInt(e.target.value)||0}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
                <p className="text-xs text-slate-400 mt-1">Alerta cuando el stock caiga por debajo de este numero</p>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
