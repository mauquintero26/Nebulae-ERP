'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Package, Search, Filter, Plus, ChevronLeft, Save,
  Globe, Tag, Layers, DollarSign, RefreshCw
} from 'lucide-react';
import { apiFetch as _apiFetch, API_URL } from '@/lib/api';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

const TABS = ['Informacion General', 'SKUs y Variantes', 'Stock', 'E-Commerce'];

export default function ProductosPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [products, setProducts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [soloRevision, setSoloRevision] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [pasoVariantes, setPasoVariantes] = useState<'atributos' | 'combinaciones'>('atributos');
  const [atributosElegidos, setAtributosElegidos] = useState<{ nombre: string; valores: string }[]>([{ nombre: '', valores: '' }]);
  const [combinaciones, setCombinaciones] = useState<{ clave: string; atributos: Record<string, string>; sku: string; sale_price: string; cost_price: string; initial_stock: string }[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [productoRecienCreadoId, setProductoRecienCreadoId] = useState<number | null>(null);

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
      if (soloRevision) params.set('necesita_revision', 'true');
      const d = await apiFetch(`/products?${params}&limit=100`);
      setProducts(Array.isArray(d) ? d : (d?.data ?? d?.products ?? []));
      setTotal(d?.total ?? (Array.isArray(d) ? d.length : 0));
    } catch { setProducts([]); }
    finally { setLoading(false); }
  }, [search, soloRevision]);

  useEffect(() => {
    load();
    apiFetch('/categories').then(d => setCategories(Array.isArray(d) ? d : (d?.data ?? []))).catch(()=>{});
    apiFetch('/brands').then(d => setBrands(Array.isArray(d) ? d : (d?.data ?? []))).catch(()=>{});
    apiFetch('/inventory/warehouses').then(d => setWarehouses(Array.isArray(d) ? d : (d?.data ?? []))).catch(()=>{});
  }, [load]);

  function generarCombinaciones() {
    const atributosValidos = atributosElegidos
      .filter(a => a.nombre.trim() && a.valores.trim())
      .map(a => ({ nombre: a.nombre.trim(), valores: a.valores.split(',').map(v => v.trim()).filter(Boolean) }));

    if (atributosValidos.length === 0) {
      setCombinaciones([]);
      return;
    }

    let filas: Record<string, string>[] = [{}];
    for (const attr of atributosValidos) {
      const nuevasFilas: Record<string, string>[] = [];
      for (const fila of filas) {
        for (const valor of attr.valores) {
          nuevasFilas.push({ ...fila, [attr.nombre]: valor });
        }
      }
      filas = nuevasFilas;
    }

    setCombinaciones(filas.map(fila => {
      const sufijo = Object.values(fila).join('-').toUpperCase().replace(/\s+/g, '');
      const base = (form.name || 'SKU').toUpperCase().replace(/\s+/g, '').slice(0, 10);
      return { clave: Object.values(fila).join('|'), atributos: fila, sku: `${base}-${sufijo}`, sale_price: form.sale_price || '', cost_price: form.cost_price || '', initial_stock: '' };
    }));
    setPasoVariantes('combinaciones');
  }

  function aplicarATodas(campo: 'sale_price' | 'cost_price' | 'initial_stock', valor: string) {
    setCombinaciones(prev => prev.map(c => ({ ...c, [campo]: valor })));
  }

  async function guardarVariantes(productId: number) {
    if (combinaciones.length === 0) return;
    const body = {
      warehouse_id: warehouseId ? Number(warehouseId) : undefined,
      skus: combinaciones.map(c => ({
        sku: c.sku,
        sale_price: Number(c.sale_price) || 0,
        cost_price: c.cost_price ? Number(c.cost_price) : undefined,
        initial_stock: c.initial_stock ? Number(c.initial_stock) : 0,
        attributes: Object.entries(c.atributos).map(([attribute_name, value]) => ({ attribute_name, value })),
      })),
    };
    await apiFetch(`/products/${productId}/skus/bulk`, { method: 'POST', body: JSON.stringify(body) });
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, is_published: isPublished };
      let productId: number;
      if (isNew) {
        const nuevo = await apiFetch('/products', { method: 'POST', body: JSON.stringify(body) });
        productId = nuevo.id;
        // Flip out of "isNew" as soon as the product exists, so that if the SKU step
        // below fails, a retry PATCHes this real product instead of POSTing a duplicate.
        setSelectedProduct(nuevo);
      } else {
        await apiFetch(`/products/${selectedProduct.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        productId = selectedProduct.id;
      }

      if (combinaciones.length > 0) {
        try {
          await guardarVariantes(productId);
        } catch (skuErr: any) {
          // The product itself was already created/updated successfully; only the SKU
          // step failed. Keep the user on the form (don't reset/close) so "Guardar"
          // retries just the SKU step against the now-existing product, instead of
          // creating a second, duplicate product.
          alert(`El producto se guardó, pero ocurrió un error creando las variantes: ${skuErr.message}. Vuelve a presionar "Guardar" para reintentar solo las variantes.`);
          setSaving(false);
          return;
        }
      }

      setSelectedProduct(null);
      setCombinaciones([]);
      setAtributosElegidos([{ nombre: '', valores: '' }]);
      setPasoVariantes('atributos');
      load();
    } catch (err: any) { alert(err.message); }
    setSaving(false);
  }

  function openNew() {
    // Reset any abandoned variants-wizard state from a previous, unsaved attempt
    // (e.g. Nuevo Producto -> generate combinations -> go back without saving).
    // Otherwise those leftover combinations would silently ride along and get
    // bulk-attached to whichever product is opened next.
    setCombinaciones([]);
    setAtributosElegidos([{ nombre: '', valores: '' }]);
    setPasoVariantes('atributos');
    setWarehouseId('');
    setForm({ name: '', description: '', type: 'Fisico', base_currency: 'COP', uom: 'Unidad',
      brand_id: '', category_id: '', sale_price: '', cost_price: '', tax_rate: 0, reference: '',
      track_inventory: true, auto_replenish: false, is_active: true, is_published: false, ecommerce_category: '', low_stock_alert: 0 });
    setIsPublished(false);
    setActiveTab(TABS[0]);
    setSelectedProduct('NEW');
  }

  function openEdit(p: any) {
    // Same reset as openNew(): don't let leftover wizard state from a previous,
    // unsaved product attempt attach bogus SKUs to this unrelated existing product.
    setCombinaciones([]);
    setAtributosElegidos([{ nombre: '', valores: '' }]);
    setPasoVariantes('atributos');
    setWarehouseId('');
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

  function closeProduct() {
    setSelectedProduct(null);
    if (searchParams.get('id')) router.replace(pathname);
  }

  // Deep-link: Abastecimiento "Ver Producto" enlaza aqui con ?id=<product_id>
  // para abrir directamente su ficha. load() trae hasta 100 productos sin
  // filtro -- si el catalogo crece mas alla de eso, este match puede fallar
  // para productos fuera de esa primera pagina.
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (!idParam || loading || selectedProduct) return;
    const found = products.find(p => String(p.id) === idParam);
    if (found) openEdit(found);
  }, [searchParams, products, loading]);

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
              <button onClick={() => setSoloRevision(v => !v)}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${soloRevision ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-slate-200 text-slate-500'}`}>
                Requiere revisión
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
                        {p.necesita_revision && (
                          <span className="inline-block mt-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Requiere revisión</span>
                        )}
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
        <button onClick={closeProduct} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl">
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
                    {categories.filter((c:any) => !c.parent_id).map((c:any) => (
                      <optgroup key={c.id} label={c.name}>
                        <option value={c.id}>{c.name}</option>
                        {categories.filter((h:any) => h.parent_id === c.id).map((h:any) => (
                          <option key={h.id} value={h.id}>&nbsp;&nbsp;{h.name}</option>
                        ))}
                      </optgroup>
                    ))}
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
          <div className="max-w-4xl">
            {!isNew && selectedProduct?.skus?.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50"><tr className="text-xs text-slate-400 uppercase">
                    <th className="px-4 py-3 text-left">SKU</th><th className="px-4 py-3 text-left">Variantes</th>
                    <th className="px-4 py-3 text-right">Costo</th><th className="px-4 py-3 text-right">Precio</th>
                  </tr></thead>
                  <tbody>
                    {selectedProduct.skus.map((s: any) => (
                      <tr key={s.id} className="border-t border-slate-50">
                        <td className="px-4 py-3 font-mono text-sm">{s.sku}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {(s.attribute_values || []).map((av: any) => av.value).join(', ') || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">${Number(s.cost_price||0).toLocaleString('es-CO')}</td>
                        <td className="px-4 py-3 text-right">${Number(s.sale_price||0).toLocaleString('es-CO')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {pasoVariantes === 'atributos' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="font-black text-sm text-slate-700 mb-1">Variantes (opcional)</h3>
                <p className="text-xs text-slate-400 mb-4">Ej: Talla con valores "S, M, L" y Color con valores "Rojo, Azul". Deja vacio si el producto no tiene variantes.</p>
                {atributosElegidos.map((a, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3 mb-2">
                    <input placeholder="Atributo (ej: Talla)" value={a.nombre}
                      onChange={e => setAtributosElegidos(prev => prev.map((x, idx) => idx === i ? { ...x, nombre: e.target.value } : x))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" />
                    <input placeholder="Valores separados por coma (ej: S, M, L)" value={a.valores}
                      onChange={e => setAtributosElegidos(prev => prev.map((x, idx) => idx === i ? { ...x, valores: e.target.value } : x))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" />
                  </div>
                ))}
                <button type="button" onClick={() => setAtributosElegidos(prev => [...prev, { nombre: '', valores: '' }])}
                  className="text-xs font-bold text-purple-600 mt-1">+ Agregar otro atributo</button>
                <div className="mt-4">
                  <button type="button" onClick={generarCombinaciones}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-bold text-sm">
                    Generar combinaciones
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-black text-sm text-slate-700">{combinaciones.length} combinaciones generadas</h3>
                  <button type="button" onClick={() => setPasoVariantes('atributos')} className="text-xs font-bold text-slate-500">← Cambiar atributos</button>
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Bodega para el stock inicial</label>
                  <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400">
                    <option value="">Seleccionar...</option>
                    {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-400 uppercase">
                    <th className="text-left py-2">Variante</th><th className="text-left py-2">SKU</th>
                    <th className="text-right py-2">Precio <button type="button" className="text-purple-600 font-bold ml-1" onClick={() => aplicarATodas('sale_price', combinaciones[0]?.sale_price || '')}>(aplicar a todas)</button></th>
                    <th className="text-right py-2">Costo</th><th className="text-right py-2">Stock inicial</th>
                  </tr></thead>
                  <tbody>
                    {combinaciones.map((c, i) => (
                      <tr key={c.clave} className="border-t border-slate-50">
                        <td className="py-2">{Object.values(c.atributos).join(' / ')}</td>
                        <td className="py-2">
                          <input value={c.sku} onChange={e => setCombinaciones(prev => prev.map((x, idx) => idx === i ? { ...x, sku: e.target.value } : x))}
                            className="w-32 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono" />
                        </td>
                        <td className="py-2 text-right">
                          <input type="number" value={c.sale_price} onChange={e => setCombinaciones(prev => prev.map((x, idx) => idx === i ? { ...x, sale_price: e.target.value } : x))}
                            className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right" />
                        </td>
                        <td className="py-2 text-right">
                          <input type="number" value={c.cost_price} onChange={e => setCombinaciones(prev => prev.map((x, idx) => idx === i ? { ...x, cost_price: e.target.value } : x))}
                            className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right" />
                        </td>
                        <td className="py-2 text-right">
                          <input type="number" value={c.initial_stock} onChange={e => setCombinaciones(prev => prev.map((x, idx) => idx === i ? { ...x, initial_stock: e.target.value } : x))}
                            className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-slate-400 mt-3">Las combinaciones se crean al guardar el producto con el botón "Guardar" de arriba.</p>
              </div>
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
